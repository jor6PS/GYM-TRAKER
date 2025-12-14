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

### 3. Configuración de Base de Datos (IMPORTANTE)
Copia y pega el siguiente bloque de código en el **SQL Editor** de tu proyecto de Supabase para configurar todas las tablas, funciones y permisos necesarios.

```sql
-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Crear Tabla de Perfiles (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Crear Tabla de Entrenamientos (Workouts)
CREATE TABLE IF NOT EXISTS public.workouts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  structured_data JSONB NOT NULL,
  source TEXT CHECK (source IN ('web', 'audio', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Crear Tabla de Rutinas (Workout Plans)
CREATE TABLE IF NOT EXISTS public.workout_plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  exercises JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Crear Tabla de Amistades (Friendships)
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- 6. Habilitar Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- 7. Políticas de Seguridad (Policies)

-- PROFILES
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- WORKOUTS
CREATE POLICY "Users can view own workouts" ON public.workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "View friends workouts" ON public.workouts FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (user_id = auth.uid() AND friend_id = workouts.user_id AND status = 'accepted')
    OR (friend_id = auth.uid() AND user_id = workouts.user_id AND status = 'accepted')
  )
);
CREATE POLICY "Users can insert own workouts" ON public.workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workouts" ON public.workouts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workouts" ON public.workouts FOR DELETE USING (auth.uid() = user_id);

-- PLANS
CREATE POLICY "Users can manage own plans" ON public.workout_plans FOR ALL USING (auth.uid() = user_id);

-- FRIENDSHIPS
CREATE POLICY "Users can read own friendships" ON public.friendships FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can insert friendships" ON public.friendships FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own friendships" ON public.friendships FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- 8. Configurar Storage (Imágenes)
-- Intentar crear bucket. Si falla por permisos, crear manualmente 'avatars' (Public) en el Dashboard.
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING ( bucket_id = 'avatars' );
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'avatars' AND auth.role() = 'authenticated' );

-- 9. Triggers y Funciones

-- Trigger: Crear perfil automáticamente al registrarse en Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RPC: Buscar usuarios por nombre/email (Seguro)
CREATE OR REPLACE FUNCTION search_users(search_term TEXT, current_user_id UUID)
RETURNS TABLE (id UUID, name TEXT, avatar_url TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.avatar_url
  FROM profiles p
  WHERE (p.name ILIKE '%' || search_term || '%' OR p.email ILIKE '%' || search_term || '%')
  AND p.id != current_user_id
  LIMIT 10;
END;
$$;
```

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