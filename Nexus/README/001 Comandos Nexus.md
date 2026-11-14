`NEXUS Experiment 001 — Remote Vibration`
001-A aprobado: la vibración local funciona mediante React Native `Vibration`.
```
node --version
npm --version
npm install ws
npx create-expo-app@latest nombre_app
npx expo start

codex plugin add expo@openai-curated
```

`NEXUS Experiment 002 — Network Comunication test`
Phone A y Phone B se comunican bidireccionalmente mediante WebSocket usando el relay Node.js.


---


**Dependencias**
```
npx expo install @expo/vector-icons**
npm install react-native-paper
npm install react-native-safe-area-context
npm install @react-native-vector-icons/material-design-icons
```


WebSockets sin TLS
```
const socket = new WebSocket( 
'ws://192.168.0.7:8080' 
);

npm run relay
```

Comandos útiles GIT BASH
```
netstat -ano | findstr :8080
taskkill -F //PID 6884
```
