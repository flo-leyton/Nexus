package expo.modules.camera

import android.graphics.Bitmap
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.PixelCopy
import android.view.Surface
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import androidx.camera.view.PreviewView
import kotlin.math.roundToInt

/** Reads only the attached preview surface. CameraX retains ownership of that surface. */
internal class Nx10PreviewSampler(private val preview: PreviewView) {
  private val main = Handler(Looper.getMainLooper())
  private var enabled = false
  private var aborted = false
  private var inFlight = false
  private var generation = 0
  // The worker owns the bitmap. Stop only releases it after any copy completes.
  private var buffer: Bitmap? = null
  private var windowStart = 0L
  private var captured = 0
  private var dropped = 0
  private var misses = 0
  private var totalMs = 0L
  private var maxMs = 0L
  private var size = "-"

  private val watchdog = Runnable {
    dropped++
    maxMs = maxOf(maxMs, COPY_BUDGET_MS)
    abort("copy_deadline")
  }
  private val tick = object : Runnable {
    override fun run() {
      if (!enabled) return
      if (inFlight) dropped++ else sample()
      if (enabled) {
        if (SystemClock.elapsedRealtime() - windowStart >= REPORT_MS) report("sampling")
        main.postDelayed(this, SAMPLE_MS)
      }
    }
  }

  fun setEnabled(value: Boolean) {
    if (!value) {
      stop("paused")
      return
    }
    if (enabled || aborted) return
    generation++
    enabled = true
    misses = 0
    windowStart = SystemClock.elapsedRealtime()
    Log.i(TAG, "started target_fps=4 max_size=640x360_or_portrait")
    if (inFlight) main.postDelayed(watchdog, COPY_BUDGET_MS)
    main.post(tick)
  }

  private fun sample() {
    val view = if (preview.isAttachedToWindow && preview.isShown) findSurfaceView(preview) else null
    val holder = view?.holder
    val frame = holder?.surfaceFrame
    val surface = holder?.surface
    if (surface == null || !surface.isValid || frame == null || frame.isEmpty) {
      miss("no_supported_surface")
      return
    }
    val portrait = frame.height() > frame.width()
    val scale = minOf(1.0, (if (portrait) 360.0 else 640.0) / frame.width(),
      (if (portrait) 640.0 else 360.0) / frame.height())
    val width = (frame.width() * scale).roundToInt().coerceAtLeast(1)
    val height = (frame.height() * scale).roundToInt().coerceAtLeast(1)
    size = "${width}x$height"
    val started = SystemClock.elapsedRealtime()
    val requestGeneration = generation
    inFlight = true
    main.postDelayed(watchdog, COPY_BUDGET_MS)
    worker.post {
      // Some Android versions perform work before PixelCopy.request returns.
      // Allocate and submit on the worker, and never wait for it on the UI thread.
      try {
        copy(surface, width, height) { result ->
          val elapsed = SystemClock.elapsedRealtime() - started
          main.post { complete(requestGeneration, result, elapsed) }
        }
      } catch (_: RuntimeException) {
        main.post { complete(requestGeneration, PixelCopy.ERROR_SOURCE_INVALID, SystemClock.elapsedRealtime() - started) }
      }
    }
  }

  private fun copy(surface: Surface, width: Int, height: Int, done: (Int) -> Unit) {
    val previous = buffer
    val target = if (previous != null && previous.width == width && previous.height == height) previous else {
      previous?.recycle()
      buffer = null
      Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { buffer = it }
    }
    PixelCopy.request(surface, target, { result -> done(result) }, worker)
  }

  private fun complete(requestGeneration: Int, result: Int, elapsed: Long) {
    main.removeCallbacks(watchdog)
    inFlight = false
    if (!enabled) {
      releaseBuffer()
      return
    }
    if (requestGeneration != generation) return
    if (elapsed >= COPY_BUDGET_MS) {
      dropped++
      maxMs = maxOf(maxMs, elapsed)
      abort("copy_deadline")
    } else if (result == PixelCopy.SUCCESS) {
      captured++
      misses = 0
      totalMs += elapsed
      maxMs = maxOf(maxMs, elapsed)
    } else {
      miss("pixel_copy_$result")
    }
  }

  private fun miss(reason: String) {
    dropped++
    misses++
    if (misses >= MAX_MISSES) abort(reason)
  }

  private fun abort(reason: String) {
    aborted = true
    stop(reason)
  }

  private fun stop(reason: String) {
    if (!enabled) return
    enabled = false
    main.removeCallbacks(tick)
    main.removeCallbacks(watchdog)
    if (!inFlight) releaseBuffer()
    report(reason)
  }

  private fun releaseBuffer() {
    worker.post {
      buffer?.recycle()
      buffer = null
    }
  }

  private fun report(reason: String) {
    val now = SystemClock.elapsedRealtime()
    val durationMs = (now - windowStart).coerceAtLeast(1)
    val fpsTenths = captured * 10000L / durationMs
    val avgMs = if (captured > 0) totalMs / captured else 0L
    Log.i(TAG, "reason=$reason size=$size captured=$captured dropped=$dropped fps=${fpsTenths / 10}.${fpsTenths % 10} copy_avg_ms=$avgMs copy_max_ms=$maxMs")
    windowStart = now
    captured = 0
    dropped = 0
    totalMs = 0
    maxMs = 0
  }

  private fun findSurfaceView(view: View): SurfaceView? {
    if (view is SurfaceView) return view
    if (view is ViewGroup) for (index in 0 until view.childCount) {
      findSurfaceView(view.getChildAt(index))?.let { return it }
    }
    return null
  }

  private companion object {
    const val TAG = "NexusNx10Preview"
    const val SAMPLE_MS = 250L
    const val COPY_BUDGET_MS = 120L
    const val REPORT_MS = 5000L
    const val MAX_MISSES = 8
    val worker by lazy { Handler(HandlerThread("NexusNx10PixelCopy").apply { start() }.looper) }
  }
}
