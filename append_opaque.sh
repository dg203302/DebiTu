#!/bin/bash

# Target files
F_INICIO="/home/dg/Documents/GitHub/Client-Management-System/Estilos/estilos_inicio.css"
F_CONFIG="/home/dg/Documents/GitHub/Client-Management-System/Estilos/estilos_config.css"
F_CLIENTES="/home/dg/Documents/GitHub/Client-Management-System/Estilos/estilos_clientes.css"

# CSS to append
BLOCK_INICIO="
/* =====================
   Transparencia Desactivada (Fondo Opaco)
   ===================== */
:root[data-theme=\"dark\"][data-trans=\"false\"] .glass-panel,
:root[data-theme=\"dark\"][data-trans=\"false\"] .bottom-nav,
:root[data-theme=\"dark\"][data-trans=\"false\"] .header-text,
:root[data-theme=\"dark\"][data-trans=\"false\"] .header-copy h1,
:root[data-theme=\"dark\"][data-trans=\"false\"] .cfg-toast,
:root[data-theme=\"dark\"][data-trans=\"false\"] .details-panel,
:root[data-theme=\"dark\"][data-trans=\"false\"] .control-panel,
:root[data-theme=\"dark\"][data-trans=\"false\"] .add-client-sheet,
:root[data-theme=\"dark\"][data-trans=\"false\"] .op-detail-drawer,
:root[data-theme=\"dark\"][data-trans=\"false\"] .prompt-sheet,
:root[data-theme=\"dark\"][data-trans=\"false\"] .confirm-sheet {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: #141722 !important;
}

:root[data-theme=\"light\"][data-trans=\"false\"] .glass-panel,
:root[data-theme=\"light\"][data-trans=\"false\"] .bottom-nav,
:root[data-theme=\"light\"][data-trans=\"false\"] .header-text,
:root[data-theme=\"light\"][data-trans=\"false\"] .header-copy h1,
:root[data-theme=\"light\"][data-trans=\"false\"] .cfg-toast,
:root[data-theme=\"light\"][data-trans=\"false\"] .details-panel,
:root[data-theme=\"light\"][data-trans=\"false\"] .control-panel,
:root[data-theme=\"light\"][data-trans=\"false\"] .add-client-sheet,
:root[data-theme=\"light\"][data-trans=\"false\"] .op-detail-drawer,
:root[data-theme=\"light\"][data-trans=\"false\"] .prompt-sheet,
:root[data-theme=\"light\"][data-trans=\"false\"] .confirm-sheet {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: #ffffff !important;
}
"

BLOCK_OTHER="
/* =====================
   Transparencia Desactivada (Fondo Opaco)
   ===================== */
:root[data-trans=\"false\"] .glass-panel,
:root[data-trans=\"false\"] .bottom-nav,
:root[data-trans=\"false\"] .header-text,
:root[data-trans=\"false\"] .header-copy h1,
:root[data-trans=\"false\"] .cfg-toast,
:root[data-trans=\"false\"] .details-panel,
:root[data-trans=\"false\"] .control-panel,
:root[data-trans=\"false\"] .add-client-sheet,
:root[data-trans=\"false\"] .op-detail-drawer,
:root[data-trans=\"false\"] .prompt-sheet,
:root[data-trans=\"false\"] .confirm-sheet,
:root[data-trans=\"false\"] .valor-card {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: var(--surface-2) !important;
}
"

echo "$BLOCK_INICIO" >> "$F_INICIO"
echo "$BLOCK_OTHER" >> "$F_CONFIG"
echo "$BLOCK_OTHER" >> "$F_CLIENTES"

