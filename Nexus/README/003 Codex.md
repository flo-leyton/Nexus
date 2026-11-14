
# PLANTILLA DE PROMPT - POR MÓDULO 
```text
Implementa NX-XXX — NOMBRE DE TAREA.

Lee primero AGENTS.md y las fuentes de verdad que indica.

Módulo principal:
MOD-XX.

Objetivo:
[resultado concreto]

Respeta exactamente el alcance y criterios de aceptación de BACKLOG.md.

Antes de editar:
1. inspecciona el estado actual;
2. identifica los archivos relevantes;
3. informa cualquier contradicción con ARCHITECTURE.md.

No modifiques áreas fuera del alcance.

Implementa los cambios.

Ejecuta las validaciones correspondientes.

Al terminar informa:
- archivos creados/modificados;
- comportamiento implementado;
- tests ejecutados;
- resultado de lint;
- resultado de TypeScript;
- limitaciones;
- cualquier desviación del task.
```

# 17. QUÉ HACES TÚ MIENTRAS CODEX TRABAJA

No necesitas observar cada línea.

Debes vigilar cuatro cosas:

### Scope

¿Está tocando solamente lo pedido?

### Arquitectura

¿Está violando las fuentes de verdad?

### Diff

¿Los archivos modificados tienen sentido?

### Resultado

¿La feature realmente funciona?

---

# 18. CÓMO REVISAR LO QUE HIZO CODEX

Primero:

```bash
git status -sb
```

Después:

```bash
git diff --stat
```

Esto muestra algo parecido a:

```text
domain/session/session.ts       | 80 +++++
tests/session.test.ts           | 55 ++++
2 files changed
```

Pregunta principal:

> ¿Por qué tocó esos archivos?

Si esperabas 3 archivos y modificó 27:

**investigar antes de commit.**

Después puedes revisar:

```bash
git diff
```