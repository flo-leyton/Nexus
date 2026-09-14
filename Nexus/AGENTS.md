# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# Configuración de conexión

- Toda conexión al servidor debe usar `SERVER_CONFIG` de `config/server.ts` (alias `@/config/server` en la aplicación; ruta relativa en el relay).
- Nunca escribir directamente la IP ni el puerto del servidor en otros archivos.
- `config/server.ts` es configuración manual: no modificar las constantes `IP` ni `PORT` salvo petición explícita del usuario.
- Mantener el único cliente compartido de `services/socket.ts`; no duplicar conexiones ni alterar eventos al configurar URLs.
