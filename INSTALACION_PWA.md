# 📲 Guía de Instalación PWA

## Requisitos para Instalación

1. **HTTPS**: La aplicación debe servirse a través de HTTPS (requerido para PWA)
2. **Navegador compatible**: Chrome/Edge (Android/Desktop), Safari (iOS)
3. **Service Worker**: Debe estar registrado correctamente

## Métodos de Instalación

### 🔵 Android (Chrome)

#### Método 1: Prompt Automático
- Abre la app en Chrome
- Debería aparecer un banner en la parte inferior: "Instalar GymTracker AI"
- Toca "Instalar" o "Añadir a pantalla de inicio"

#### Método 2: Menú de Chrome
- Abre la app en Chrome
- Toca el menú (3 puntos) en la esquina superior derecha
- Selecciona **"Instalar aplicación"** o **"Añadir a pantalla de inicio"**

#### Método 3: Botón Manual (Perfil)
- Abre la app y ve a tu **Perfil** (icono de usuario)
- Si aparece el botón **"INSTALAR COMO APLICACIÓN"**, tócalo
- Sigue las instrucciones del navegador

### 🍎 iOS (Safari)

1. Abre la app en **Safari** (no funciona en Chrome en iOS)
2. Toca el botón **"Compartir"** (cuadrado con flecha hacia arriba)
3. Desplázate hacia abajo y toca **"Añadir a pantalla de inicio"**
4. Personaliza el nombre si quieres y toca **"Añadir"**

### 💻 Desktop (Chrome/Edge)

1. Abre la app en Chrome o Edge
2. Busca el icono de **instalación** en la barra de direcciones (círculo con +)
3. O ve al menú (3 puntos) → **"Instalar GymTracker AI"**
4. Confirma la instalación

## Solución de Problemas

### ❌ No aparece el prompt de instalación

**Causas posibles:**
1. **No estás en HTTPS**: Las PWA requieren HTTPS (excepto localhost)
2. **Ya está instalada**: Verifica si ya tienes la app instalada
3. **Navegador incompatible**: Usa Chrome (Android) o Safari (iOS)
4. **Service Worker no registrado**: Verifica en DevTools → Application → Service Workers

**Soluciones:**
- Verifica que estés usando HTTPS
- Limpia la caché del navegador
- Verifica en DevTools que el manifest esté cargado correctamente
- Usa el botón manual en el Perfil

### ❌ El botón de instalación no aparece en el Perfil

**Causas:**
- La app ya está instalada
- El navegador no soporta PWA
- El service worker no se registró correctamente

**Verificación:**
1. Abre DevTools (F12)
2. Ve a **Application** → **Service Workers**
3. Debe aparecer `/sw.js` como "activated and running"

### ❌ Error al instalar

**Soluciones:**
1. Verifica que todos los iconos estén presentes en `dist/`
2. Verifica que el manifest.webmanifest sea válido
3. Revisa la consola del navegador para errores
4. Asegúrate de estar en HTTPS

## Verificación Post-Instalación

Después de instalar:
- ✅ La app debe abrirse sin la barra de direcciones
- ✅ Debe tener su propio icono en la pantalla de inicio
- ✅ Debe funcionar offline (con limitaciones)
- ✅ Debe aparecer en la lista de aplicaciones instaladas

## Notas Técnicas

- **registerType**: `autoUpdate` - El service worker se actualiza automáticamente
- **display**: `standalone` - La app se abre sin barra de navegador
- **start_url**: `/` - La app inicia en la raíz
- **scope**: `/` - La app controla toda la ruta

