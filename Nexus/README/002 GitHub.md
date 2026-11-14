Sí. Para ustedes dos, yo protegería `main` con una regla **simple pero suficiente**: nadie hace push directo; todo entra por Pull Request. GitHub permite hacerlo con branch protection o rulesets; para su caso, una regla sobre `main` basta. [GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches?apiVersion=2022-11-28&utm_source=chatgpt.com)

Haz esto en GitHub:

1. Entra a tu repositorio **Nexus**.
2. Ve a **Settings**.
3. En el menú izquierdo entra a **Branches**.
4. En **Branch protection rules**, pulsa **Add classic branch protection rule**. GitHub documenta exactamente esa ruta. [GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule?ref=blog.gitguardian.com&utm_source=chatgpt.com)
5. En **Branch name pattern**, escribe:
    
    ```
    main
    ```
    

Ahora activa estas opciones:

- **Require a pull request before merging** → ACTIVADO
- Dentro de esa opción:
    - **Require approvals** → ACTIVADO
    - Required approvals: **1**
- **Require conversation resolution before merging** → ACTIVADO
- **Do not allow bypassing the above settings** → ACTIVADO si te aparece y quieres que ni siquiera ustedes puedan saltarse la regla fácilmente
- **Allow force pushes** → DESACTIVADO
- **Allow deletions** → DESACTIVADO

GitHub indica que proteger una rama bloquea por defecto los force-push y la eliminación de la rama protegida, y puede exigir PR antes del merge. [GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches?apiVersion=2022-11-28&utm_source=chatgpt.com)

Por ahora **NO activaría todavía**:

- Require status checks before merging
- Require signed commits
- Require merge queue
- Require deployments

La razón es práctica: todavía no tienen CI configurado. Si activamos checks obligatorios sin tener workflows estables, se pueden bloquear solos y perder tiempo. Más adelante, cuando tengamos GitHub Actions para `lint`, `tsc` y tests, ahí sí lo activamos.

La configuración final debería quedar más o menos así:

```
Branch name pattern:
main

[x] Require a pull request before merging
    [x] Require approvals
        Approvals required: 1

[x] Require conversation resolution before merging

[x] Do not allow bypassing the above settings   ← si está disponible

[ ] Allow force pushes
[ ] Allow deletions
```

Después guarda con **Create** o **Save changes**, según lo que muestre la interfaz.

### ¿Qué cambia desde ese momento?

Ya no podrán hacer esto:

```
git switch main
git add .
git commit -m "algo"
git push
```

Ese `push` a `main` debería rechazarse.

Ahora el flujo correcto será:

```
git switch main
git pull --ff-only

git switch -c feature/NX-010-session-domain
```

Trabajan ahí.

Luego:

```
git add .
git commit -m "feat(nx-010): implement session domain"
git push -u origin feature/NX-010-session-domain
```

Después abren Pull Request hacia:

```
feature/NX-010-session-domain
            ↓
           main
```

Uno revisa, aprueba y recién ahí hacen merge.

### Para ustedes dos, esta regla es importante

Como son solo dos desarrolladores y ambos tocan arquitectura, exigir **1 aprobación** es ideal.

Eso obliga a que:

- Dev A no mergee solo cambios delicados sin que Dev B los mire.
- Dev B tampoco.
- Codex no puede “colarse” directamente a `main`.
- todo queda registrado en PR.

GitHub también aclara que una review con cambios solicitados solo bloquea de verdad el merge si la rama tiene protección configurada; por eso vale la pena hacerlo ahora. [GitHub Docs](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews?utm_source=chatgpt.com)

Mi configuración recomendada para NEXUS hoy es:

> **main protegido + PR obligatorio + 1 aprobación + sin force push + sin delete.**

Nada más por ahora.

Después de proteger `main`, el siguiente paso inmediato es **NX-001: congelar el baseline actual de NEXUS Studio en una rama y subirlo por PR**.

---
# 13. NUNCA EMPIECES UNA FEATURE ASÍ

Incorrecto:

```text
Estoy en main.

Codex, implementa WebRTC.
```

Correcto:

```bash
git switch main
git pull --ff-only

git switch -c feature/NX-111-webrtc-preview
```

Después:

```text
Codex, implementa NX-111.
```

---

# 14. FLUJO DIARIO 80/20

Antes de trabajar:

```bash
git switch main
git pull --ff-only
```

Crear rama:

```bash
git switch -c feature/NX-XXX-nombre
```

Trabajar con Codex.

Después:

```bash
git status -sb
git diff
```

Validar:

```bash
npm run lint
npx tsc --noEmit
```

Más tests correspondientes.

Luego:

```bash
git add .
git commit -m "feat(nx-xxx): descripcion"
git push -u origin feature/NX-XXX-nombre
```

Abrir PR.

Revisar.

Merge.

Finalmente:

```bash
git switch main
git pull --ff-only
```

Y recién entonces comenzar el siguiente NX.

# 20. PULL REQUEST

Después de:

```bash
git push
```

GitHub normalmente mostrará:

**Compare & pull request**

Haz clic.

Base:

```text
main
```

Compare:

```text
tu rama
```

---

# 21. FORMATO DE PR

Título:

```text
NX-010 — Session domain
```

Descripción mínima:

```text
## Objetivo

Implementa Session domain.

## Cambios

- SessionId
- SessionStatus
- Session entity
- invariants
- tests

## Validación

- lint PASS
- TypeScript PASS
- tests PASS

## Limitaciones

Ninguna conocida.
```

---

# 22. REVISAR EL PR

Abrir:

**Files changed**

No revisar solo si compila.

Preguntar:

```text
¿Hace únicamente lo que pedimos?

¿Rompe otro módulo?

¿Cambió interfaces?

¿Aparecieron archivos inesperados?

¿Los tests demuestran el comportamiento?
```

---

# 23. MERGE

Para este proyecto recomiendo normalmente:

**Squash and merge**

Así cada NX queda representado por un commit limpio en `main`.

Ejemplo:

```text
NX-010 Session domain
NX-011 Node domain
NX-020 NexusMessage
```

en lugar de decenas de commits internos de Codex.

---

# 24. DESPUÉS DEL MERGE

En VS Code:

```bash
git switch main
git pull --ff-only
```

Eliminar rama local:

```bash
git branch -d feature/NX-XXX-nombre
```

Ahora tu `main` contiene la feature.

# 25. REGLA PARA DOS DESARROLLADORES

Antes de crear cualquier rama:

```bash
git switch main
git pull --ff-only
```

Siempre.

Developer A:

```text
main → feature/NX-010
```

Developer B:

```text
main → feature/NX-011
```

Trabajan separados.

Después PR.

Después merge.

Después ambos:

```bash
git pull --ff-only
```

---

# 26. CUÁNDO APARECEN CONFLICTOS

Un conflicto aparece cuando dos ramas cambian la misma zona incompatible.

Reducimos conflictos mediante:

- tareas pequeñas;
    
- ownership de módulos;
    
- ramas cortas;
    
- merges frecuentes;
    
- actualizar `main` antes de empezar.
    

No intentamos eliminar todos los conflictos.

Intentamos que sean pequeños.