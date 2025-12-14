# GYM.AI - Intelligent Workout Tracker 🏋️‍♂️🌑

> **"Donde la fuerza se encuentra con la naturaleza y la tecnología."**

![App Logo Preview](https://via.placeholder.com/150x150/000000/ffffff?text=GYM.AI+Logo)

**GymTracker AI** es una **Web App Progresiva (PWA)** de última generación diseñada para atletas que buscan minimizar el tiempo de registro y maximizar sus resultados. Utiliza **Inteligencia Artificial (Gemini 2.5 Flash)** para convertir notas de voz naturales en datos estructurados de entrenamiento.

Construida con un diseño "Obsidian/Volt" moderno (Modo Oscuro por defecto), ofrece una experiencia visual premium, minimalista y enfocada en el rendimiento.

---

## 📸 Capturas de Pantalla

| Dashboard Principal | Registro por Voz AI | Estadísticas & PRs |
|:-------------------:|:-------------------:|:------------------:|
| ![Dashboard](https://via.placeholder.com/300x600/121212/D4FF00?text=Dashboard+View) | ![AI Voice](https://via.placeholder.com/300x600/121212/D4FF00?text=Voice+Recorder) | ![Charts](https://via.placeholder.com/300x600/121212/D4FF00?text=PR+Modal) |

---

## ✨ Características Principales

### 🧠 1. Registro Potenciado por IA (Gemini)
Olvídate de teclear series y repeticiones. Simplemente habla:
> *"Hice 3 series de press banca con 80 kilos por 10 repeticiones y luego sentadillas..."*
La IA procesa el audio, extrae los ejercicios, normaliza los nombres y estructura los datos automáticamente.

### 🌍 2. Soporte Multi-idioma (i18n)
*   **Español por defecto:** La aplicación inicia totalmente en castellano para una experiencia nativa.
*   **Toggle Rápido:** Cambia entre Español (ES) e Inglés (EN) instantáneamente desde la cabecera.
*   **IA Políglota:** El "Gym Bro" AI adapta sus análisis y veredictos al idioma seleccionado.

### ⚔️ 3. La Arena (Social & Competitivo)
*   **Sistema de Amigos:** Busca usuarios por email, envía solicitudes y colabora.
*   **Calendario Multijugador:** Visualiza los entrenamientos de tus amigos en tu calendario con códigos de colores.
*   **Comparador de PRs:** Tabla matricial para ver quién levanta más en cada ejercicio.
*   **Juez AI:** Gemini analiza los datos del grupo y emite un veredicto sarcástico sobre quién es el "Alpha" del grupo.

### 📅 4. Calendario Interactivo & Historial
*   Visualización mensual limpia tipo "Github contributions".
*   Indicadores visuales de días de entrenamiento.
*   Navegación fluida entre días pasados y futuros.
*   **Reportes Mensuales AI:** Genera un resumen de tu mes con análisis de tendencias y un "veredicto final" sarcástico pero motivador.

### ⚡ 5. Planes de Entrenamiento "Quick Tiles"
*   Diseño compacto y cuadrado para ahorrar espacio.
*   Crea rutinas predefinidas (Push, Pull, Legs, etc.).
*   Aplica una rutina completa con un solo clic.
*   **Smart Fill:** La app recuerda automáticamente los pesos de tu última sesión al aplicar una rutina.

### 📈 6. Análisis de Progreso (PRs)
*   Seguimiento automático de Récords Personales (PRs).
*   Gráficos interactivos de progresión de cargas y 1RM estimado.
*   Historial detallado filtrable por ejercicio.

### 🛡️ 7. Panel de Administración
*   Gestión de usuarios y base de datos global.
*   Capacidad de "Impersonation" (ver la app como otro usuario) para soporte.
*   Métricas globales del sistema en tiempo real.

---

## 🛠️ Stack Tecnológico

*   **Frontend:** React 19, TypeScript, Vite.
*   **Estilos:** Tailwind CSS (Configuración personalizada de fuentes Inter/JetBrains Mono).
*   **Estado Global:** React Context API (para i18n).
*   **Backend / Auth:** Supabase (PostgreSQL, Auth, Storage, Edge Functions).
*   **AI:** Google Gemini API (`@google/genai` v1.33+).
*   **Gráficos:** Recharts.
*   **Iconos:** Lucide React.
*   **Utilidades:** Date-fns (con localización dinámica).

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
# Nota: Configura esto en tus variables de entorno de Vercel/Netlify para producción.
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

-- Friendships (Social Features)
create table friendships (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  friend_id uuid references auth.users not null,
  status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(user_id, friend_id)
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
  
-- RPC for User Search (Secure)
create or replace function search_users(search_term text, current_user_id uuid)
returns table (id uuid, name text, avatar_url text)
language plpgsql security definer
as $$
begin
  return query
  select p.id, p.name, p.avatar_url
  from profiles p
  where (p.email ilike search_term or p.name ilike '%' || search_term || '%')
  and p.id != current_user_id
  limit 5;
end;
$$;
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