import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'es' | 'en';

const translations = {
  es: {
    // General
    loading: "Cargando...",
    error: "Error",
    cancel: "Cancelar",
    save: "Guardar",
    delete: "Eliminar",
    edit: "Editar",
    
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
    monthly_report: "Reporte Mensual",
    exercise_highlights: "Destacados",
    gym_bro_analysis: "Análisis del Gym Bro",
    final_verdict: "El Veredicto Final",
    top_lift: "Récord",
    consulting_ai: "Consultando a los dioses del gym...",
    no_data_month: "No hay datos este mes. ¡A entrenar!",
    
    // Actions
    delete_exercise_title: "¿Borrar Ejercicio?",
    delete_exercise_desc: "Este set será eliminado.",
    delete_workout_title: "¿Borrar Entrenamiento?",
    delete_workout_desc: "Se borrará todo el registro.",
    delete_plan_title: "¿Borrar Rutina?",
    delete_plan_desc: "La rutina se perderá para siempre.",
    
    // Modals
    input_log: "Introducir Actividad",
    placeholder_log: "> Iniciar log: 3 series de press banca 80kg...",
    submit_log: "Enviar_Log",
    abort: "Abortar",
    
    // Manual Structured Entry (New)
    manual_entry: "Registro Manual",
    search_exercise: "Buscar Ejercicio...",
    add_custom: "Añadir Personalizado",
    add_set: "Añadir Serie",
    confirm_exercise: "Confirmar Ejercicio",
    finish_workout: "Finalizar Entreno",
    no_exercises_added: "No has añadido ejercicios aún.",
    start_adding_below: "Usa el buscador para empezar.",
    notes_placeholder: "Notas generales (energía, molestias...)",
    
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
  },
  en: {
    // General
    loading: "Loading...",
    error: "Error",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    
    // Header
    viewing_as: "Viewing as",
    exit: "Exit",
    
    // Auth
    sign_in: "Sign In",
    sign_up: "Sign Up",
    start_journey: "Start Journey",
    full_name: "Full Name",
    email_user: "Username or Email",
    email: "Email Address",
    password: "Password",
    have_account: "Already have an account? Sign In",
    no_account: "Don't have an account? Sign Up",
    check_inbox: "Check your inbox",
    verification_sent: "We've sent a verification link to",
    back_signin: "Back to Sign In",
    forgot_password: "Forgot Password?",
    recover_password: "Recover Password",
    recover_intro: "Enter your email to receive a recovery link.",
    send_recovery: "Send Link",
    recovery_sent_title: "Email sent",
    recovery_sent_desc: "If an account exists with this email, you will receive a password reset link.",
    
    // Dashboard
    routines: "WORKOUT ROUTINES",
    saved: "Saved",
    new: "NEW",
    todays_log: "TODAY'S LOG",
    logs: "Logs",
    no_activity: "No activity recorded.",
    tap_mic: "Tap the mic below to start.",
    sets: "SETS",
    vol: "VOL",
    manual: "AI TEXT",
    listening: "LISTENING...",
    processing: "PROCESSING...",
    
    // Calendar
    today: "Today",
    
    // Monthly Report
    monthly_report: "Monthly Report",
    exercise_highlights: "Exercise Highlights",
    gym_bro_analysis: "Gym Bro Analysis",
    final_verdict: "The Final Verdict",
    top_lift: "Top Lift",
    consulting_ai: "Consulting the Gym Gods...",
    no_data_month: "No data for this month.",
    
    // Actions
    delete_exercise_title: "Delete Exercise?",
    delete_exercise_desc: "This set will be removed.",
    delete_workout_title: "Delete Workout?",
    delete_workout_desc: "Entire log will be deleted.",
    delete_plan_title: "Delete Plan?",
    delete_plan_desc: "Routine will be lost.",
    
    // Modals
    input_log: "Input Data Log",
    placeholder_log: "> Initialize log: 3 sets of bench press 80kg...",
    submit_log: "Submit_Log",
    abort: "Abort",

    // Manual Structured Entry (New)
    manual_entry: "Manual Entry",
    search_exercise: "Search Exercise...",
    add_custom: "Add Custom",
    add_set: "Add Set",
    confirm_exercise: "Confirm Exercise",
    finish_workout: "Finish Workout",
    no_exercises_added: "No exercises added yet.",
    start_adding_below: "Use search to start adding.",
    notes_placeholder: "General notes (energy, pain, etc...)",
    
    // Profile
    profile: "Profile",
    joined: "Joined",
    workouts_total: "Logs",
    stats_month: "THIS MONTH",
    stats_year: "THIS YEAR",
    stats_total: "TOTAL",
    admin: "ADMINISTRATOR",
    member: "MEMBER",
    save_changes: "Save Changes",
    sign_out: "Sign Out",
    display_name: "Display Name",
    new_password: "New Password (Optional)",
    confirm_password: "Confirm Password",
    
    // Rest Timer
    rest_timer: "Rest Timer",

    // ARENA / SOCIAL
    enter_arena: "Enter The Arena",
    opponents: "Opponents",
    judge_me: "GO!",
    arena_title: "THE ARENA",
    gladiators_ready: "Gladiators Ready",
    fight: "FIGHT!",
    judging: "JUDGING...",
    alpha: "ALPHA",
    beta: "BETA",
    consistency_points: "Consistency Points",
    key_matchups: "Key Matchups",
    no_common_exercises: "No common exercises found between all participants.",
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['es']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('es'); // Default to Spanish

  useEffect(() => {
    const storedLang = localStorage.getItem('language') as Language;
    if (storedLang && (storedLang === 'es' || storedLang === 'en')) {
      setLanguage(storedLang);
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: keyof typeof translations['es']) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};