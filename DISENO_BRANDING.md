# Sistema de Diseño y Branding - DebiTu (Neo-Fintech Dark & Volt)

Este documento define las especificaciones exactas del nuevo estilo visual premium (inspirado en la estética fintech de nueva generación / Monex), tokens CSS, paleta de colores, tipografías y componentes reutilizables para la renovación completa de todas las plantillas de **DebiTu**.

---

## 1. Filosofía y Estética Visual

- **Tema:** Dark Mode profundo estilo OLED/Obsidian con acento Neón Eléctrico ("Volt / Lime Green").
- **Sensación:** Premium, ágil, moderna, limpia, de alta fidelidad y confiabilidad financiera.
- **Bordes:** Muy redondeados (`border-radius: 24px` a `32px` para tarjetas, `16px` a `20px` para botones, `9999px` para pills y badges).
- **Efectos de superficie:** Fondos oscuros mate con bordes finos sutiles (`1px solid rgba(255, 255, 255, 0.07)`), desenfoque de fondo (`backdrop-filter: blur(16px)`), y acentos con resplandor (*glow*) controlado.

---

## 2. Tokens de Color y Variables CSS

```css
:root {
  /* Fondos Base */
  --bg-primary: #0a0c0f;       /* Fondo de la app / pantallas */
  --bg-surface: #12151b;       /* Superficie principal de contenedores */
  --bg-card: #181c24;          /* Tarjetas y módulos */
  --bg-card-hover: #1e232d;    /* Hover sobre tarjetas */
  --bg-card-muted: #14171f;    /* Tarjetas secundarias / inputs */

  /* Acentos de Marca (Volt / Lime Neón) */
  --brand-volt: #ccff00;       /* Color insignia, botones principales, CTAs */
  --brand-volt-hover: #b8e600;
  --brand-volt-glow: rgba(204, 255, 0, 0.35);
  --brand-volt-gradient: linear-gradient(135deg, #d8ff3e 0%, #a8e82e 100%);
  --brand-volt-text: #0b0f03;  /* Texto oscuro sobre el fondo volt */

  /* Acentos Funcionales / Semánticos */
  --accent-success: #4ade80;   /* Verde para pagos / cobros / positivo */
  --accent-danger: #ff4d4f;    /* Rojo carmín para deudas / vencidos / negativo */
  --accent-warning: #facc15;   /* Amarillo / advertencias */
  --accent-purple: #a855f7;    /* Detalles / categorías especiales */

  /* Tipografía y Textos */
  --text-primary: #ffffff;     /* Títulos, cifras principales */
  --text-secondary: #9aa1b0;   /* Etiquetas secundarias, subtítulos */
  --text-muted: #5d6575;       /* Textos inactivos, timestamps */

  /* Bordes y Separadores */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-card: rgba(255, 255, 255, 0.06);
  --border-focus: rgba(204, 255, 0, 0.5);

  /* Sombras y Luces */
  --shadow-card: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 25px var(--brand-volt-glow);
  --shadow-floating: 0 20px 40px rgba(0, 0, 0, 0.6);

  /* Tipografía */
  --font-main: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

---

## 3. Tipografía y Jerarquía

- **Display Balances / Cifras Gigantes:**
  - `font-size: 2.5rem` a `3rem` (`40px` a `48px`).
  - `font-weight: 800` (Bold/Extrabold).
  - Decimales ligeramente más compactos (`font-size: 1.5rem` / `70%`).
- **Títulos de Pantalla:**
  - `font-size: 1.35rem` a `1.5rem` (`22px` - `24px`), `font-weight: 700`, color `--text-primary`.
- **Encabezados de Sección:**
  - `font-size: 1rem` (`16px`), `font-weight: 600`, con botón "Ver todos" o acción en `--text-secondary` / `--brand-volt`.
- **Subtítulos y Metadatos:**
  - `font-size: 0.82rem` a `0.875rem` (`13px` - `14px`), `color: var(--text-secondary)`.

---

## 4. Biblioteca de Componentes Clave

### A. Barra Superior (Header de App)
- Flecha de retroceso o avatar del negocio a la izquierda en cápsula redonda oscura.
- Título de la pantalla centrado o a la izquierda.
- Campana de notificaciones o menú contextual a la derecha en botón circular traslúcido (`rgba(255, 255, 255, 0.05)` con borde `border-subtle`).

### B. Tarjeta de Saldo Principal (Hero Balance)
- Fondo oscuro pulido o degradado Volt metálico.
- Indicador pill de estado financiero: `+ $4,560.50` (en verde neón cápsula).
- Gran cifra destacada: `$6,324.49`.
- Acciones Rápidas (3-4 botones circulares):
  - **Cobrar / Registrar Pago** ($\downarrow$ con círculo oscuro o volt)
  - **Nueva Deuda** ($\uparrow$)
  - **Transferir / Notificar** ($\rightleftarrows$)

### C. Tarjeta Física / Débito Digital (Fintech Card)
- Dimensiones con relación de aspecto tarjeta (85.60 × 53.98 mm).
- Gradiente metálico Volt (`var(--brand-volt-gradient)`), texto negro brillante.
- Chip EMV, número enmascarado (`•••• 3377`), logo (DebiTu / VISA).

### D. Pantalla de Operación / Teclado Numérico (Send / Charge Money)
- Selector de contacto/cliente en carrusel horizontal de avatares con botón "+ Nuevo".
- Entrada de importe gigante y centrada con cursor parpadeante neón (`$ 0.00`).
- Pastillas rápidas de monto: `+$50`, `+$100`, `+$500`, `+$1,000`.
- Teclado numérico táctil integrado de 12 teclas (1 al 9, punto, 0, botón borrar).
- Botón inferior fijo de acción: `btn-volt-action` ancho completo.

### E. Listas de Transacciones / Deudas / Pagos
- Ítem contenedor: Card redondeada (`18px`), fondo `--bg-card`, separación limpia.
- Ícono del cliente / categoría: Avatar circular con iniciales o logo con fondo contrastado.
- Detalle: Nombre en negrita, hora/fecha o categoría en gris sutil.
- Monto alineado a la derecha:
  - Verde neón para pagos recibidos (`+ $150.00`).
  - Blanco / Coral para deudas pendientes (`- $250.00`).

### F. Barra de Navegación Flotante Inferior (Bottom Nav)
- Barra flotante fija con efecto blur:
  - Posición fija abajo (`bottom: 20px`), centrada, con cápsula redondeada (`padding: 12px 20px`, `border-radius: 40px`).
  - Botones de navegación:
    1. **Inicio / Dashboard**
    2. **Clientes / Deudas**
    3. **Botón Central Flotante Volt (+):** Círculo elevado color `--brand-volt` con ícono negro, pulso suave al tacto.
    4. **Estadísticas / Métricas**
    5. **Configuración / Perfil**

### G. Gráficos y Estadísticas (Analytics)
- Selector de período tipo cápsula segmentada (`Mensual | Semanal | Diario`).
- Gráficos de área SVG suaves con línea Volt luminosa y relleno degradado transparente.
- Tarjetas de resumen en cuadrícula (2 columnas) con mini-barras o indicadores de progreso.

---

## 5. Mapeo de Plantillas a Renovar

| Plantilla Original | Plantilla Renovada | Propósito / Enfoque Visual |
| :--- | :--- | :--- |
| `Inicio.html` | `Dashboard_renov.html` | Pantalla principal, balance global, métricas rápidas, transacciones recientes y accesos directos. |
| Operación Nueva | `Operacion_renov.html` | Teclado numérico, selección de cliente, registro de nueva deuda o abono instantáneo. |
| `administracion_clientes.html` | `Clientes_renov.html` | Directorio de clientes con avatares, saldo pendiente por cobrar, historial y acciones directas. |
| `Estadisticas.html` | `Estadisticas_renov.html` | Curvas de cobros vs deudas, desglose por categorías, gráficos interactivos neón. |
| `Configuracion.html` | `Configuracion_renov.html` | Perfil del negocio, monedas, integración de WhatsApp/recordatorios, seguridad. |
| `inicio_sesion.html` | `Login_renov.html` | Autenticación biométrica / email elegante, estética minimalista y moderna. |

---

*Sistema guardado y listo para ser implementado en todos los archivos de la carpeta `Plantillas_Renovadas`.*
