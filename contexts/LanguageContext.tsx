
import React, { createContext, useContext, useState, useEffect } from 'react';

// Spanish only translations
const translations = {
  es: {
    // General
    loading: "Cargando...",
    error: "Error",
    cancel: "Cancelar",
    save: "Guardar",
    delete: "Eliminar",
    edit: "Editar",
    abort: "Abortar",
    
    // Header
    viewing_as: "Viendo como",
    exit: "Salir",
    
    // Auth
    sign_in: "Iniciar Sesión",
    sign_up: "Registrarse",
    start_journey: "Empezar",
    full_name: "Nombre Completo",
    email_user: "Usuario o Email",
    email: "Correo Electrónico",
    password: "Contraseña",
    have_account: "¿Ya tienes cuenta? Inicia Sesión",
    no_account: "¿No tienes cuenta? Regístrate",
    check_inbox: "Revisa tu bandeja de entrada",
    verification_sent: "Hemos enviado un enlace de verificación a",
    back_signin: "Volver al Inicio",
    forgot_password: "¿Olvidaste tu contraseña?",
    recover_password: "Recuperar Contraseña",
    recover_intro: "Introduce tu correo para recibir un enlace de recuperación.",
    send_recovery: "Enviar Enlace",
    recovery_sent_title: "Correo enviado",
    recovery_sent_desc: "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.",
    username_taken: "Este nombre de usuario ya está en uso.", 
    
    // Dashboard
    routines: "RUTINAS",
    saved: "Guardadas",
    new: "NUEVA",
    todays_log: "REGISTRO DE HOY",
    logs: "Registros",
    no_activity: "Sin actividad registrada.",
    tap_mic: "Toca el micro para empezar.",
    sets: "SERIES",
    vol: "VOL",
    manual: "AI TEXTO",
    listening: "ESCUCHANDO...",
    processing: "PROCESANDO...",
    
    // Calendar
    today: "Hoy",
    
    // Monthly Report
    ai_report_title: "Reporte IA",
    global_monthly_subtitle: "Global y Mensual",
    monthly_report: "Reporte Mensual",
    exercise_highlights: "Destacados",
    gym_bro_analysis: "Análisis del Gym Bro",
    final_verdict: "El Veredicto Final",
    top_lift: "Récord",
    consulting_ai: "Consultando a los dioses del gym...",
    no_data_month: "No hay datos este mes. ¡A entrenar!",
    monthly_maxes: "Máximos del Mes",
    lifetime_load: "Carga Total Histórica",
    report_of: "Reporte de",
    
    // Actions
    delete_exercise_title: "¿Borrar Ejercicio?",
    delete_exercise_desc: "Este set será eliminado.",
    delete_workout_title: "¿Borrar Entrenamiento?",
    delete_workout_desc: "Se borrará todo el registro.",
    delete_plan_title: "¿Borrar Rutina?",
    delete_plan_desc: "La rutina se perderá para siempre.",
    
    // Modals & Builder
    input_log: "Introducir Actividad",
    builder: "Constructor",
    overview: "Resumen",
    library: "Biblioteca",
    history: "Historial",
    history_clone: "Clonar Sesión",
    search_db: "Buscar en BD (ej. Banca)...",
    no_matches: "No se encontraron coincidencias.",
    add_set: "Añadir Serie",
    add_to_session: "Añadir a Sesión",
    session_empty: "Sesión Vacía",
    go_to_lib: "Ve a la biblioteca para añadir.",
    open_library: "Abrir Biblioteca",
    add_another: "Añadir Otro Ejercicio",
    save_session: "Guardar Sesión",
    back: "Atrás",
    added: "Añadido",
    manual_entry: "Entrada Manual",
    no_exercises_added: "No has añadido ejercicios.",
    start_adding_below: "Usa el buscador para añadir.",
    search_exercise: "Buscar ejercicio...",
    add_custom: "Añadir Personalizado",
    confirm_exercise: "Confirmar Ejercicio",
    notes_placeholder: "Notas sobre el entrenamiento...",
    finish_workout: "Finalizar Entrenamiento",
    
    // Profile
    profile: "Perfil",
    joined: "Miembro desde",
    workouts_total: "Entrenos",
    stats_month: "ESTE MES",
    stats_year: "ESTE AÑO",
    stats_total: "TOTAL",
    admin: "ADMINISTRADOR",
    member: "MIEMBRO",
    save_changes: "Guardar Cambios",
    sign_out: "Cerrar Sesión",
    display_name: "Nombre Visible",
    new_password: "Nueva Contraseña (Opcional)",
    confirm_password: "Confirmar Contraseña",
    lifetime_aggregates: "Totales Históricos",
    total_load: "Carga Total (Volumen)",
    api_key_label: "Tu API Key de Gemini (Opcional)",
    api_key_placeholder: "Pega tu clave AIza...",
    api_key_help: "Usa tu propia cuota gratuita de Google.",
    get_api_key: "Conseguir Key Gratis",
    
    // Rest Timer
    rest_timer: "Descanso",
    
    // ARENA / SOCIAL
    enter_arena: "Entrar a la Arena",
    opponents: "Oponentes",
    judge_me: "GO!",
    arena_title: "LA ARENA",
    gladiators_ready: "Gladiators Listos",
    fight: "¡PELEA!",
    judging: "JUZGANDO...",
    alpha: "ALFA",
    beta: "BETA",
    consistency_points: "Puntos de Consistencia",
    key_matchups: "Enfrentamientos Clave",
    no_common_exercises: "No hay ejercicios en común entre todos.",
    gladiator_highlights: "Ficha de Gladiador",
    top_feats: "Mejores Marcas",
    no_valid_records: "Sin registros válidos aún.",
  }
};

interface LanguageContextType {
  t: (key: keyof typeof translations['es']) => string;
  language: 'es'; // Fixed to es
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Always 'es'
  const t = (key: keyof typeof translations['es']) => {
    return translations.es[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ t, language: 'es' }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
