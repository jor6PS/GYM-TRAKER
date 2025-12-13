# GYM.AI - Intelligent Workout Tracker 🏋️‍♂️🌑

> **"Donde la fuerza se encuentra con la naturaleza y la tecnología."**

![App Logo Preview](https://via.placeholder.com/150x150/000000/ffffff?text=GYM.AI+Logo)
*(Reemplaza este enlace con una captura de tu nuevo logo con la luna)*

GymTracker AI es una **Web App Progresiva (PWA)** de última generación diseñada para atletas que buscan minimizar el tiempo de registro y maximizar sus resultados. Utiliza **Inteligencia Artificial (Gemini 2.5 Flash)** para convertir notas de voz naturales en datos estructurados de entrenamiento.

Construida con un diseño "Obsidian/Volt" moderno, ofrece una experiencia visual premium, minimalista y enfocada en el rendimiento.

---

## 📸 Capturas de Pantalla

| Dashboard Principal | Registro por Voz AI | Estadísticas & PRs |
|:-------------------:|:-------------------:|:------------------:|
| ![Dashboard](https://via.placeholder.com/300x600/121212/D4FF00?text=Dashboard+View) | ![AI Voice](https://via.placeholder.com/300x600/121212/D4FF00?text=Voice+Recorder) | ![Charts](https://via.placeholder.com/300x600/121212/D4FF00?text=PR+Modal) |
*(Sube tus capturas a la carpeta /docs/images y actualiza estos enlaces)*

---

## ✨ Características Principales

### 🧠 1. Registro Potenciado por IA (Gemini)
Olvídate de teclear series y repeticiones. Simplemente habla:
> *"Hice 3 series de press banca con 80 kilos por 10 repeticiones y luego sentadillas..."*
La IA procesa el audio, extrae los ejercicios, normaliza los nombres y estructura los datos automáticamente.

### 📅 2. Calendario Interactivo & Historial
*   Visualización mensual limpia tipo "Github contributions".
*   Indicadores visuales de días de entrenamiento.
*   Navegación fluida entre días pasados y futuros.

### ⚡ 3. Planes de Entrenamiento "Quick Tiles"
*   Diseño compacto y cuadrado para ahorrar espacio.
*   Crea rutinas predefinidas (Push, Pull, Legs, etc.).
*   Aplica una rutina completa con un solo clic.
*   **Smart Fill:** Si ya has hecho el ejercicio antes, la app recuerda tu último peso.

### 📈 4. Análisis de Progreso (PRs)
*   Seguimiento automático de Récords Personales.
*   Gráficos interactivos de volumen y peso máximo estimado.
*   Historial detallado por ejercicio.

### 🛡️ 5. Panel de Administración
*   Gestión de usuarios y base de datos global.
*   Capacidad de "Impersonation" (ver la app como otro usuario) para soporte.
*   Métricas globales del sistema.

### 🎨 6. UI/UX Premium
*   **Tema Obsidian:** Fondo oscuro profundo para ahorrar batería y reducir fatiga visual.
*   **Acento Volt:** Color lima vibrante para acciones principales.
*   **Glassmorphism:** Paneles translúcidos modernos.
*   **Animaciones:** Transiciones suaves y feedback visual.

---

## 🛠️ Stack Tecnológico

*   **Frontend:** React 18, TypeScript, Vite.
*   **Estilos:** Tailwind CSS (Configuración personalizada de fuentes y colores).
*   **Backend / Auth:** Supabase (PostgreSQL, Auth, Storage, Edge Functions).
*   **AI:** Google Gemini API (`@google/genai`).
*   **Gráficos:** Recharts.
*   **Iconos:** Lucide React.
*   **Utilidades:** Date-fns, Clsx.

---

## 🚀 Guía de Instalación y Despliegue

Sigue estos pasos para ejecutar el proyecto en local:

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/gym-ai-tracker.git
cd gym-ai-tracker
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configuración de Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto y añade las siguientes claves. Necesitarás una cuenta en [Supabase](https://supabase.com) y una API Key de [Google AI Studio](https://aistudio.google.com).

```env
# Supabase Configuration
VITE_SUPABASE_URL=tu_supabase_project_url
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key

# Google Gemini AI Configuration
# Nota: En producción, se recomienda usar un proxy o Edge Function para no exponer esta key,
# pero para demos locales o PWAs personales, puede ir aquí (con riesgo).
API_KEY=tu_gemini_api_key
```

### 4. Configuración de Base de Datos (Supabase)
Ejecuta el siguiente SQL en el editor de Supabase para crear las tablas necesarias:

```sql
-- Profiles (Extends Auth)
create table profiles (
  id uuid references auth.users not null primary key,
  email text,
  name text,
  role text default 'user',
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Workouts
create table workouts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  date date not null,
  structured_data jsonb not null,
  source text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Workout Plans
create table workout_plans (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  exercises jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Trigger para crear perfil automático al registrarse
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'name', 'user');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 5. Ejecutar en desarrollo
```bash
npm run dev
```
Abre tu navegador en `http://localhost:5173`.

---

## 📱 Convertir en App (PWA)

1. Abre la aplicación en **Google Chrome** (Android/Desktop) o **Safari** (iOS).
2. Selecciona "Añadir a pantalla de inicio" o "Instalar Aplicación".
3. La app funcionará como una aplicación nativa, a pantalla completa y sin barra de navegación.

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Siéntete libre de usarlo, modificarlo y compartirlo.

---

**Hecho con 💪 y 🌑 por [Tu Nombre]**
