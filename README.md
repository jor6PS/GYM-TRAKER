# GYM.AI - Intelligent Workout Tracker 🏋️‍♂️🌑

> **"Donde la fuerza se encuentra con la naturaleza y la tecnología."**

![App Logo Preview](https://via.placeholder.com/150x150/000000/ffffff?text=GYM.AI+Logo)

**GymTracker AI** es una **Web App Progresiva (PWA)** de última generación diseñada para atletas que buscan minimizar el tiempo de registro y maximizar sus resultados. Utiliza **Inteligencia Artificial (Gemini 2.5 Flash)** para convertir notas de voz naturales en datos estructurados de entrenamiento.

Construida con un diseño "Obsidian/Volt" moderno, ofrece una experiencia visual premium y un modo oscuro nativo.

---

## 🏃‍♂️ Para Usuarios (Atletas)

Si solo quieres usar la aplicación para entrenar, no necesitas configurar nada técnico.

### 🌐 Acceso Directo
Accede a la versión oficial estable aquí:
# 👉 [workout.jorgps.com](https://workout.jorgps.com)

### 📲 Cómo instalar (App Nativa)
Al ser una **PWA**, puedes instalarla en tu móvil sin pasar por la App Store o Play Store:

1.  **iOS (iPhone):** Abre el enlace en Safari → Botón "Compartir" → **"Añadir a pantalla de inicio"**.
2.  **Android:** Abre el enlace en Chrome → Menú (3 puntos) → **"Instalar aplicación"** o "Añadir a pantalla de inicio".

---

## ✨ Características Principales

### 🧠 1. Registro Potenciado por IA (Gemini)
Olvídate de teclear series y repeticiones. Simplemente toca el micrófono y habla:
> *"Hice 3 series de press banca con 80 kilos por 10 repeticiones RPE 8 y luego sentadillas..."*
La IA procesa el audio, extrae los ejercicios, normaliza los nombres y estructura los datos automáticamente.

### ⚔️ 2. La Arena (Social & Competitivo)
*   **Sistema de Amigos:** Busca usuarios por nombre, envía solicitudes y crea tu "Crew".
*   **Calendario Multijugador:** Visualiza cuándo entrenaron tus amigos directamente en tu calendario (puntos de colores).
*   **Comparador de PRs:** Tabla matricial para ver quién es el más fuerte en ejercicios comunes.
*   **Juez AI:** Gemini analiza los datos del grupo y emite un veredicto sarcástico sobre quién es el "Alpha" y quién necesita esforzarse más.

### 🌍 3. Internacionalización (i18n)
*   Cambia instantáneamente entre **Español** e **Inglés**.
*   El "Gym Bro" AI adapta su personalidad y análisis al idioma seleccionado.

### 📅 4. Calendario Interactivo & Reportes
*   Visualización mensual limpia.
*   **Reportes Mensuales AI:** Genera un resumen de tu mes con análisis de tendencias y un "veredicto final" motivador.

### ⚡ 5. Planes de Entrenamiento
*   Crea rutinas predefinidas (Push, Pull, Legs, etc.).
*   **Smart Fill:** Al aplicar una rutina, la app rellena automáticamente los pesos basándose en tu última sesión histórica.

### 📈 6. Progreso y Gráficos
*   Cálculo automático de **1RM Estimado** (Fórmula Epley).
*   Gráficos de volumen y progresión de cargas.

---

## 🛠️ Guía de Desarrollo (Self-Hosting)

Sigue esta sección **SOLO** si eres desarrollador y quieres modificar el código o desplegar tu propia instancia privada de la aplicación.

### Prerrequisitos
*   Node.js 18+
*   Cuenta en [Supabase](https://supabase.com) (Base de datos y Auth).
*   API Key de [Google AI Studio](https://aistudio.google.com) (Modelo Gemini 2.5 Flash).

### 1. Instalación Local
```bash
git clone https://github.com/tu-usuario/gym-ai-tracker.git
cd gym-ai-tracker
npm install
```

### 2. Variables de Entorno
Crea un archivo `.env` en la raíz. Es crítico usar el prefijo `VITE_` para que el frontend pueda acceder a ellas.

```env
# Supabase (Configuración de Proyecto)
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anonima-publica

# Google Gemini AI (Inteligencia)
# Nota: En desarrollo local usa VITE_API_KEY.
# En producción (Vercel/Netlify), configura la variable de entorno API_KEY en el panel de control.
VITE_API_KEY=tu_clave_api_gemini
```

### 3. Configuración de Base de Datos (SQL)
Debes ejecutar el script SQL proporcionado (`database_setup.sql` o ver abajo) en el Editor SQL de Supabase para crear las tablas y funciones necesarias.

**Estructura necesaria:**
1.  **Tablas:** `profiles`, `workouts`, `workout_plans`, `friendships`.
2.  **Storage:** Bucket público llamado `avatars`.
3.  **Funciones RPC:** `search_users`, `get_email_by_username`.
4.  **RLS Policies:** Configuradas para permitir la interacción social segura.

*(Ver código fuente `services/supabase.ts` para inferir esquemas o solicitar el archivo SQL completo).*

### 4. Ejecutar en Desarrollo
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:5173`.

### 5. Construcción para Producción
```bash
npm run build
```
Esto generará la carpeta `dist/` optimizada con Code Splitting y PWA manifest listos para desplegar en Vercel, Netlify o cualquier servidor estático.

---

## 📄 Licencia

Este proyecto es Open Source bajo la licencia MIT.

---

**Hecho con 💪, 🌑 y React 19.**