# Guía rápida de Pliego Claro

**Dirección:** https://nestorguerra.github.io/pliego-claro/

## 1. Entrar
1. Pulsa **Crear cuenta**: nombre, empresa, correo y una contraseña de al menos 10 caracteres con letras y números.
2. Abre el correo de confirmación (caduca en una hora) y vuelve a la web.
3. ¿Olvidaste la contraseña? **He olvidado la contraseña** → te llega un enlace de un solo uso.

## 2. Configurar la empresa
**Empresa y equipo → Capacidades y solvencia.** Escribe sectores (puedes poner códigos CPV), zonas, solvencia técnica y económica, medios y documentos disponibles. Sirve para explicar coincidencias; no demuestra aptitud.

Para trabajar en equipo: **Miembros, permisos y roles → Crear invitación** con el correo de la persona y su permiso (lectura, edición o administración). Para revocar un acceso: **Retirar acceso**.

## 3. Encontrar una licitación
**Oportunidades → Buscar en PLACSP**: filtra por texto, CPV, provincia, importe, fechas y estado. Pulsa **Crear expediente**. El expediente queda vigilado: si la Plataforma publica un cambio, recibes un aviso y una tarea.

## 4. Trabajar el expediente (seis pasos)
1. **Ficha**: datos oficiales.
2. **Documentos**: **Archivar copia oficial** del PCAP y el PPT (o sube tus archivos). El texto se extrae página a página; si es un escaneado, pulsa **Aplicar OCR**.
3. **Requisitos y evidencia**: **Analizar con IA** propone requisitos con página y cita comprobada; añade los que quieras como *pendientes*. Para confirmar cada uno: documento revisado, página o cláusula, evidencia de la empresa y su vigencia.
4. **Decisión y costes**: GO solo es posible si los requisitos decisivos tienen evidencia vigente y el plazo no ha pasado. Escribe siempre el motivo.
5. **Preparación**: checklist, responsables, fechas y notas.
6. **Seguimiento**: cambios oficiales con su antes y después, comentarios del equipo y actividad.

La firma y la presentación siempre se hacen en el portal oficial, por una persona.

## 5. Exportar y recuperar
- **Exportar revisión** (en el expediente): informe imprimible. **Matriz CSV** y **calendario .ics** desde Ajustes.
- **Ajustes → Copia completa (.zip)**: todo el espacio con los originales. Para recuperarlo: **Traer copia** y elegir el .zip.
- Lo borrado va a la **Papelera** (Ajustes) y se puede restaurar.

## Quién administra qué
Néstor Guerra administra el repositorio de GitHub, el proyecto de Supabase, Resend y la clave de Anthropic. Para cortar la IA de inmediato, pon `ai_enabled = 0` en la tabla `app_limits` de Supabase.
