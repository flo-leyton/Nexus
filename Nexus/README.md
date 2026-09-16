# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

La conexión se configura únicamente en `config/server.ts`: cambia manualmente
`IP` y `PORT`. La aplicación y el relay utilizan esos mismos valores. Después de
cambiarlos, reinicia el relay y recarga la aplicación para abrir una nueva conexión.
Ejecuta el relay con `npm run relay` usando Node.js 22.18+ o 24+ para cargar
directamente la configuración TypeScript. `SOCKET_URL` usa WebSocket (`ws://`);
`HTTP_URL` queda disponible para futuras peticiones HTTP (el relay actual no ofrece una API HTTP).

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

### Pestaña Dispositivos

- Reinicia el servidor con `npm run relay` y abre la aplicación con `npx expo start` en ambos teléfonos.
- Selecciona A en un teléfono y B en el otro desde Vibración o Linterna, y pulsa Conectar. La nueva pestaña también permite conectar usando el mismo WebSocket.
- Abre Dispositivos: cada teléfono debe mostrar su ficha local y la ficha remota, incluso si se conectaron en momentos distintos. La información se comparte al conectarse, al cambiar un rol, al volver a primer plano y al actualizarla.
- Los roles de Vibración y Linterna siguen siendo independientes. Si seleccionas roles distintos entre pestañas, la ficha muestra ambos; la funcionalidad no cambia sus selecciones.
- Pulsa Actualizar información para renovar los datos locales y enviarlos al otro teléfono. También se renuevan cada 30 segundos con la app activa y conectada.
- Cierra la aplicación remota: aparecerá “Dispositivo remoto desconectado” y se conservará su última ficha. Una pérdida abrupta de red puede tardar aproximadamente 60 segundos en detectarse. Reconecta manualmente desde Conectar si se pierde la conexión local.
- Comprueba la regresión: envía una vibración A → B (y B → A), y en Linterna prueba `flash_on` y `flash_off` con los permisos y roles habituales.

Los datos no disponibles se muestran como “No disponible”. En Android se consultan las capacidades declaradas de cámara y flash, sin abrir la cámara ni pedir permisos. En iOS estas capacidades y la presencia del vibrador no se infieren. El nombre del dispositivo en iOS puede ser genérico. RAM y almacenamiento son valores reportados por el sistema (GB decimales), y la resolución corresponde a la pantalla reportada por React Native. En web y simuladores puede faltar información.

La ficha remota corresponde al escenario de dos teléfonos. El relay conserva los datos solo en memoria durante la conexión. No se obtienen identificadores de hardware ni se añaden permisos.

Validación automatizada: `node --test tests/device-presence.test.cjs`, `npx tsc --noEmit` y `npm run lint`.

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
