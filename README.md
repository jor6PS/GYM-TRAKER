# GYM.AI - Intelligent Workout Tracker 🏋️‍♂️🌑

> **"Donde la fuerza se encuentra con la naturaleza y la tecnología."**

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

### 🧠 1. Registro Híbrido (Voz, Texto y Manual)
*   **Voz (IA):** Toca el micrófono y habla. Gemini 2.5 Flash procesa tu audio en segundos.
    > *"Hice 3 series de press banca con 80 kilos..."*
*   **Texto (IA):** Escribe libremente como si chatearas con un amigo.
*   **Manual (Estructurado):** Un constructor clásico para cuando prefieres precisión quirúrgica.

### ⚔️ 2. La Arena (Social & Competitivo)
*   **Sistema de Amigos:** Busca usuarios por nombre, envía solicitudes y crea tu "Crew".
*   **Calendario Multijugador:** Visualiza cuándo entrenaron tus amigos directamente en tu calendario (puntos de colores).
*   **Comparador de PRs:** Tabla matricial para ver quién es el más fuerte en ejercicios comunes.
*   **Juez AI:** Gemini analiza los datos del grupo y emite un veredicto sarcástico sobre quién es el "Alpha" y quién necesita esforzarse más.

### 📅 3. Calendario Interactivo & Reportes
*   Visualización mensual limpia.
*   **Reportes Mensuales AI:** Genera un resumen de tu mes con análisis de tendencias y un "veredicto final" motivador.

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
Crea un archivo `.env` en la raíz.

```env
# Supabase (Configuración de Proyecto)
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anonima-publica

# Google Gemini AI (Inteligencia)
# La app busca 'API_KEY' o 'VITE_API_KEY'.
API_KEY=tu_clave_api_gemini
```

### 3. Configuración de Base de Datos (IMPORTANTE)
Copia y pega el bloque de código SQL (ver archivo original o repositorio) en el **SQL Editor** de tu proyecto de Supabase.

### 4. Ejecutar en Desarrollo
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:5173`.

### 5. Construcción para Producción
```bash
npm run build
```

---

## 📄 Licencia

Este proyecto es Open Source bajo la licencia MIT.

---

**Hecho con 💪, 🌑 y React 19.**