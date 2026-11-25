package com.oney.WebRTCModule

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import expo.modules.camera.Nx10FrameSink
import expo.modules.camera.Nx10PixelCopyFrames
import org.webrtc.CapturerObserver
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoFrame
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLongArray
import java.util.concurrent.atomic.AtomicInteger

class Nx10WebRtcPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(Nx10WebRtcModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class Nx10WebRtcModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {
  @Volatile private var invalidated = false
  private var releaseLatest: (() -> Unit)? = null
  private val main = Handler(Looper.getMainLooper())
  private var orientationActivity: Activity? = null
  private var previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED

  override fun getName() = "Nx10WebRtc"

  override fun invalidate() {
    invalidated = true
    restoreNodeOrientation()
    ThreadUtils.runOnExecutor {
      releaseLatest?.invoke()
      releaseLatest = null
    }
    super.invalidate()
  }

  @ReactMethod
  fun setNodeOrientation(locked: Boolean) {
    val activity = context.currentActivity ?: return
    main.post {
      if (invalidated || activity.isFinishing || activity.isDestroyed) return@post
      if (orientationActivity !== activity) {
        orientationActivity = activity
        previousOrientation = activity.requestedOrientation
      }
      val requested = if (locked) ActivityInfo.SCREEN_ORIENTATION_LOCKED
        else ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
      if (activity.requestedOrientation != requested) activity.requestedOrientation = requested
    }
  }

  @ReactMethod
  fun restoreNodeOrientation() {
    main.post {
      val activity = orientationActivity ?: return@post
      orientationActivity = null
      if (!activity.isFinishing && !activity.isDestroyed) activity.requestedOrientation = previousOrientation
    }
  }

  @ReactMethod
  fun createStream(promise: Promise) {
    val rtc = context.getNativeModule(WebRTCModule::class.java)
    if (rtc == null) {
      promise.reject("NX10_UNAVAILABLE", "WebRTC no está disponible")
      return
    }
    // ThreadUtils is package-private in the pinned 124.0.6 build.
    ThreadUtils.runOnExecutor {
      if (invalidated) {
        promise.reject("NX10_UNAVAILABLE", "El contexto de WebRTC se cerró")
        return@runOnExecutor
      }
      if (Nx10PixelCopyFrames.sink != null) {
        promise.reject("NX10_BUSY", "Ya existe una pista PixelCopy")
        return@runOnExecutor
      }
      var trackId: String? = null
      try {
        val controller = object : AbstractVideoCaptureController(640, 360, 4) {
          override fun getDeviceId() = "nexus-pixelcopy"
          override fun createVideoCapturer(): VideoCapturer = PixelCopyCapturer()
        }
        val track = checkNotNull(rtc.createVideoTrack(controller))
        trackId = track.id()
        rtc.createStream(arrayOf<org.webrtc.MediaStreamTrack>(track)) { id, tracks ->
          val registeredTrackId = track.id()
          releaseLatest = {
            rtc.mediaStreamRemoveTrack(id, -1, registeredTrackId)
            rtc.mediaStreamTrackRelease(registeredTrackId)
            rtc.mediaStreamRelease(id)
          }
          promise.resolve(Arguments.createMap().apply {
            putString("streamId", id)
            putString("streamReactTag", id)
            putArray("tracks", Arguments.createArray().apply { tracks.forEach { pushMap(it) } })
          })
        }
      } catch (error: RuntimeException) {
        trackId?.let { rtc.mediaStreamTrackRelease(it) }
        promise.reject("NX10_TRACK_FAILED", error)
      }
    }
  }
}

private class PixelCopyCapturer : VideoCapturer, Nx10FrameSink {
  private enum class Counter { INPUT, BUSY, RETENTION_LIMIT, STALE, INVALID_SIZE, COPY_OR_QUEUE_ERROR, CONVERTED, CONVERSION_ERROR, DELIVERED, OBSERVER_ERROR, RELEASED }

  private val diagnosticId = nextDiagnosticId.incrementAndGet()
  private val counters = AtomicLongArray(Counter.entries.size)
  @Volatile private var dimensions = "-"

  private fun count(counter: Counter) = counters.incrementAndGet(counter.ordinal)

  private fun report(reason: String) {
    val totals = Counter.entries.joinToString(" ") { "${it.name.lowercase()}=${counters.get(it.ordinal)}" }
    Log.i("NexusNx10Bridge", "capture=$diagnosticId reason=$reason size=$dimensions worker_busy=${workerBusy.get()} in_flight=${MAX_IN_FLIGHT - bufferSlots.availablePermits()} $totals")
  }

  private companion object {
    const val MAX_IN_FLIGHT = 3
    val nextDiagnosticId = AtomicInteger()
  }

  private val worker = Executors.newSingleThreadExecutor()
  private val workerBusy = AtomicBoolean()
  private val bufferSlots = Semaphore(MAX_IN_FLIGHT)
  private val gate = Any()
  private lateinit var observer: CapturerObserver
  @Volatile private var generation = 0
  @Volatile private var active = false
  private var disposed = false

  override fun initialize(helper: SurfaceTextureHelper?, context: Context?, observer: CapturerObserver) {
    this.observer = observer
  }

  override fun startCapture(width: Int, height: Int, framerate: Int) = synchronized(gate) {
    if (!active && !disposed) {
      generation++
      active = true
      observer.onCapturerStarted(true)
      Nx10PixelCopyFrames.sink = this
      report("started")
    }
  }

  override fun stopCapture() = synchronized(gate) {
    if (active) {
      active = false
      generation++
      if (Nx10PixelCopyFrames.sink === this) Nx10PixelCopyFrames.sink = null
      observer.onCapturerStopped()
      report("stopped")
    }
  }

  override fun dispose() = synchronized(gate) {
    stopCapture()
    disposed = true
    worker.shutdown()
    Unit
  }

  override fun isScreencast() = false
  override fun changeCaptureFormat(width: Int, height: Int, framerate: Int) = Unit

  override fun onFrame(bitmap: Bitmap, rotation: Int, timestampNs: Long) {
    val input = count(Counter.INPUT)
    val epoch = generation
    if (!active) {
      count(Counter.STALE)
      return
    }
    if (!workerBusy.compareAndSet(false, true)) {
      count(Counter.BUSY)
      if (input % 20L == 0L) report("sampling")
      return
    }
    var queued = false
    try {
      // Crop a possible odd edge for the encoder. Portrait stays in portrait.
      val width = bitmap.width and -2
      val height = bitmap.height and -2
      if (width < 2 || height < 2) {
        count(Counter.INVALID_SIZE)
        return
      }
      val pixels = IntArray(width * height)
      dimensions = "${bitmap.width}x${bitmap.height}->${width}x$height"
      bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
      worker.execute {
        try {
          deliver(pixels, width, height, rotation, timestampNs, epoch)
        } finally {
          workerBusy.set(false)
          if (input % 20L == 0L) report("sampling")
        }
      }
      queued = true
    } catch (_: RuntimeException) {
      count(Counter.COPY_OR_QUEUE_ERROR)
    } finally {
      if (!queued) workerBusy.set(false)
    }
  }

  private fun deliver(pixels: IntArray, width: Int, height: Int, rotation: Int, timestampNs: Long, epoch: Int) {
    if (!active || epoch != generation) {
      count(Counter.STALE)
      return
    }
    if (!bufferSlots.tryAcquire()) {
      count(Counter.RETENTION_LIMIT)
      return
    }
    val buffer = try {
      toI420(pixels, width, height) {
        count(Counter.RELEASED)
        bufferSlots.release()
        if (!active) report("released-after-stop")
      }
    } catch (_: RuntimeException) {
      count(Counter.CONVERSION_ERROR)
      bufferSlots.release()
      return
    }
    count(Counter.CONVERTED)
    // VideoFrame takes the buffer reference; release it directly if construction fails.
    val frame = try {
      VideoFrame(buffer, rotation, timestampNs)
    } catch (_: RuntimeException) {
      count(Counter.CONVERSION_ERROR)
      buffer.release()
      return
    }
    try {
      synchronized(gate) {
        if (active && epoch == generation) {
          observer.onFrameCaptured(frame)
          count(Counter.DELIVERED)
        } else {
          count(Counter.STALE)
        }
      }
    } catch (_: RuntimeException) {
      count(Counter.OBSERVER_ERROR)
    } finally {
      frame.release()
    }
  }
}

private fun toI420(pixels: IntArray, width: Int, height: Int, release: Runnable): JavaI420Buffer {
  val y = ByteBuffer.allocateDirect(width * height)
  val u = ByteBuffer.allocateDirect(width * height / 4)
  val v = ByteBuffer.allocateDirect(width * height / 4)
  fun channel(pixel: Int, shift: Int) = (pixel ushr shift) and 255
  fun sample(value: Int) = value.coerceIn(0, 255).toByte()
  for (row in 0 until height step 2) {
    for (column in 0 until width step 2) {
      var red = 0
      var green = 0
      var blue = 0
      for (dy in 0..1) {
        for (dx in 0..1) {
          val index = (row + dy) * width + column + dx
          val r = channel(pixels[index], 16)
          val g = channel(pixels[index], 8)
          val b = channel(pixels[index], 0)
          y.put(index, sample(((66 * r + 129 * g + 25 * b + 128) shr 8) + 16))
          red += r
          green += g
          blue += b
        }
      }
      val chroma = (row / 2) * (width / 2) + column / 2
      u.put(chroma, sample(((-38 * red - 74 * green + 112 * blue + 512) shr 10) + 128))
      v.put(chroma, sample(((112 * red - 94 * green - 18 * blue + 512) shr 10) + 128))
    }
  }
  return JavaI420Buffer.wrap(width, height, y, width, u, width / 2, v, width / 2, release)
}
