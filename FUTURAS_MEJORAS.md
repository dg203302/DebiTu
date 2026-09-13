Para rebrandear y adaptar **DebiTú** hacia **usuarios individuales** (finanzas personales, control de préstamos entre amigos/familiares, o estilo *Splitwise / Revolut personal*), el cambio no solo es visual, sino de **perspectiva**: pasar de una relación *Comercio $\rightarrow$ Cliente* a una relación *Persona $\leftrightarrow$ Contactos / Finanzas Propias*.

Aquí tienes las mejores funciones agrupadas por impacto y facilidad de implementación sobre la arquitectura actual:

---

### 1. El Pilar Fundamental: Modelo Dual "Me Deben" vs "Yo Debo" (Balance Neto)
Actualmente DebiTu asume que el usuario siempre es el acreedor. Para una persona individual, el control financiero personal requiere dos caras de la moneda:
* **"Me Deben" (Por cobrar):** Dinero que prestaste a amigos, compañeros de trabajo o familiares.
* **"Yo Debo" (Por pagar):** Compras que alguien pagó por ti, cuotas pendientes, préstamos recibidos o servicios por saldar.
* **Posición Neta Personal:** En el Hero del Dashboard, en lugar de solo *Deuda Total Activa*, mostrar:
  $$\text{Balance Neto} = \text{Total por Cobrar} - \text{Total por Pagar}$$
  Si es positivo se ilumina en **Verde Volt** (*Estás a favor*), si es negativo en **Coral Neón** (*Tenés compromisos pendientes*).

---

### 2. "Dividir la Cuenta" / Gastos Compartidos (Estilo *Splitwise*)
Una de las herramientas más usadas por individuos en su día a día:
* **Crear Gasto Compartido (Vaquita / Asado / Salida / Viaje):**
  - Ingresas el monto total (ej. `$45.000` de una cena).
  - Seleccionas a 3 contactos de tu agenda.
  - La app calcula la división en partes iguales (o personalizada) y con un solo botón genera automáticamente las deudas individuales correspondientes a cada persona.

---

### 3. Recordatorios Amigables por WhatsApp con Alias / CBU
Para cobrarle a un cliente un mensaje formal está bien, pero para cobrarle a un amigo o conocido se necesita naturalidad:
* **Plantillas de mensajes pre-armadas en un toque:**
  - *"¡Hola Nico! Te paso el recordatorio de los $4.500 del asado del sábado 🙌"*
* **Botón para incluir tu Alias/CVU:**
  - Guardar tu Alias/CBU en *Configuración* para que el mensaje de WhatsApp adjunte directamente: *"Podés transferirme a mi Alias: `lolma.debito.mp`"*.

---

### 4. Categorías Cotidianas y Tags de Estilo de Vida
Reemplazar los conceptos comerciales (*Venta de mercadería, Abono cuota, Saldo inicial*) por hábitos de gasto personal:
* **Etiquetas predeterminadas:** 🍔 *Comidas / Salidas*, 🚗 *Transporte / Combustible*, 🏠 *Hogar / Alquiler*, 🎮 *Ocio*, 💡 *Servicios*, 🤝 *Préstamo personal*.
* El gráfico estadístico mensual que acabamos de optimizar pasaría a mostrar automáticamente en qué categoría de tu vida estás gastando o prestando más dinero.

---

### 5. Suscripciones y Pagos Fijos Recurrentes (Control de Gastos Hormiga)
Muchos usuarios pierden la cuenta de los servicios mensuales que pagan:
* Registrar débitos automáticos o fijos: *Netflix, Spotify, Gimnasio, Internet, Tarjeta de crédito*.
* Indicador de **"Días restantes para el cobro"** y alerta preventiva en el Dashboard para tener los fondos listos.

---

### 6. Bolsillos de Ahorro / Metas Financieras (*Pockets / Metas*)
Permite que el usuario individual no solo controle deudas, sino que se proyecte:
* Crear metas como *"Vacaciones", "Fondo de emergencia", "Comprar Laptop"*.
* Barra de progreso con porcentaje completado a medida que vas asignando dinero a la meta.

---

### 7. Selector de Perfil ("Modo Negocio" vs "Modo Personal")
Si no deseas perder lo construido para comercios:
* En **Configuración**, agregar un switch:
  - **💼 Modo Comercio:** Textos orientados a *Clientes, Cobranzas y Estado Crediticio*.
  - **👤 Modo Personal:** Textos orientados a *Contactos, Préstamos ("Me deben / Debo") y Gastos*.

---

### ¿Por cuál te gustaría empezar?
1. **Convertir el modelo a "Me Deben" vs "Yo Debo"** (con Balance Neto en el Dashboard).
2. **Función de "Dividir Gasto / Cuenta" entre contactos**.
3. **Generador de recordatorio de WhatsApp con Alias / CVU**.
4. **Adaptar el vocabulario y categorías a finanzas individuales**.