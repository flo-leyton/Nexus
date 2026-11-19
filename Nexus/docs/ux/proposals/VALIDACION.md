# Alcance, evidencia y reproducción

Fecha de revisión: 16-11-2026, America/La_Paz.

## Evidencia de esta entrega

| Comprobación | Resultado | Alcance |
|---|---|---|
| Rama y SHA | PASS · feat/ui-polish · e1ac26901bdbb5cdafa8c294a4b5db1c00725b7f | Mismo HEAD antes y después; sin commit nuevo. |
| Árbol inicial | PASS · limpio | Sin cambios ajenos pendientes al empezar. |
| Diff de archivos versionados / índice | PASS · vacío | Ningún archivo existente alterado; sólo archivos nuevos en docs/ux/proposals. |
| Comparación origin/desarrollo | PASS · referencia local bfe2cba | Sin fetch; no representa necesariamente el servidor GitHub al momento de lectura. |
| Sintaxis de generador/renderizador | PASS · node --check | Scripts aislados, sin imports de servicios ni dependencias nuevas. |
| Enlaces de las láminas y galería | PASS · 20 referencias locales HTML existentes | Los destinos HTML, PNG y Markdown están presentes. |
| Render | PASS · seis PNG de 1380 × 1110 | Edge instalado, headless, HTML local. La aplicación Expo no se inicia. |
| Inspección visual | PASS · seis láminas revisadas | Se ajustaron densidad, bordes y contenido. El contenido más largo se desplaza dentro del mockup HTML; REC/STOP permanecen fuera de ese scroll. |
| Contraste | PASS en los pares principales propuestos | Valores de la tabla siguiente; no certifica toda la UI. |
| TypeScript / lint / tests de aplicación | NOT RUN | Auditoría sin cambio funcional, navegación o dependencias. Quedan prescritos para implementación, junto a pruebas físicas. |
| Cámara / relay / Firebase / Cloudinary reales | NOT RUN | Sin conexión a servicios ni hardware. No se afirma validar H4 o captura real. |
| Claro, texto dinámico, TalkBack/VoiceOver | NOT RUN | Diseño oscuro representativo; requieren implementación y dispositivo. |

Las PNG no son capturas de la aplicación operativa. “Actual” reconstruye parcialmente su estructura/estilos según código. Los mockups no son componentes Paper ejecutándose; son una propuesta HTML/CSS de una jerarquía implementable con la biblioteca existente.

## Contrastes calculados

Relación de luminancia sRGB `(Lmayor + 0.05) / (Lmenor + 0.05)`.

| Par | Relación |
|---|---|
| Blanco #FFFFFF sobre índigo actual #8173F3 | 3,70:1 · insuficiente como objetivo de cuerpo normal 4,5:1 |
| Primary #BCB2FF / onPrimary #23184A | 8,42:1 |
| Texto #F6F3FA / fondo #131018 | 17,15:1 |
| Secundario #B0A8BC / superficie #1D1925 | 7,53:1 |
| Acción de grabación #FFB4AB / #530B0C | 8,70:1 |
| READY #68D7A4 / #162C25 | 8,33:1 |
| Advertencia #F1BA73 / #332619 | 8,39:1 |
| Borde #84758F / fondo #131018 | 4,41:1 |
| Borde #84758F / superficie #1D1925 | 4,04:1 |
| Borde #84758F / superficie alta #272131 | 3,65:1 |

El cambio de primary conserva la familia índigo. El tono original sigue disponible como acento gráfico. Colores semánticos siempre acompañados de texto/icono. Algunos detalles de la lámina se compactan para comparación; medir objetivos táctiles y texto dinámico exige la app real.

## Cómo revisar

1. Abrir `docs/ux/proposals/index.html` en un navegador. Contiene las seis láminas PNG, enlace a cada HTML y los documentos. Sin servidor, instalación ni red.
2. Comparar Actual / A / B en la lámina 01. El antes es reconstrucción, no screenshot de teléfono.
3. Revisar Controller preparado, Node grabando offline y Biblioteca en 02; estado parcial, READY caducado y guardado fallido en 03.
4. Revisar composición de pantalla grande en 04; desplazarse dentro de teléfonos HTML cuando haya contenido de soporte por debajo del viewport en 01/02/03/05.
5. Revisar Dispositivos/Cuenta/Studio offline en 05 y permiso/ingreso/pendiente en 06. En offline no se presenta una sesión Controller como activa: el cliente limpia su snapshot y sólo conserva la última participación Node.
6. Leer el mapa completo de funciones y los riesgos en AUDITORIA.md. Seleccionar dirección, organización y fase de implementación. Ningún control del mockup ejecuta acciones reales.

## Regeneración opcional de artefactos

Desde la carpeta de la aplicación, con Node 24 y Edge ya instalado en Windows:

```powershell
node docs/ux/proposals/generate.cjs
node --check docs/ux/proposals/generate.cjs
node --check docs/ux/proposals/render.cjs
node docs/ux/proposals/render.cjs
```

Puede renderizarse una sola lámina: `node docs/ux/proposals/render.cjs 05-soporte`.

El renderizador usa Edge sin ventana, un perfil temporal distinto por lámina y un timeout de 45 s. Escribe PNG sólo en este directorio. Los perfiles temporales quedan en el temporal del sistema; no se borra ni se toca el perfil habitual del navegador. El primer intento restringido no pudo completar su caché; se repitió con ejecución autorizada fuera del sandbox y produjo los PNG. No se instaló ninguna herramienta.

Para volver a comprobar el alcance del árbol:

```powershell
git branch --show-current
git rev-parse HEAD
git diff --exit-code
git diff --cached --exit-code
git status --short
```

Resultado esperado para esta entrega: rama y SHA originales, diffs vacíos de archivos versionados y `?? docs/` por las propuestas nuevas, sin commits ni cambios en producción. No ejecutar git add/commit como parte de la revisión.
