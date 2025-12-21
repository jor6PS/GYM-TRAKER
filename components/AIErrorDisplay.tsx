import React from 'react';
import { AlertTriangle, Clock, Key, Wifi, FileX, Brain, X } from 'lucide-react';
import { FormattedAIError } from '../services/workoutProcessor/helpers';

interface AIErrorDisplayProps {
  error: FormattedAIError;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const AIErrorDisplay: React.FC<AIErrorDisplayProps> = ({ error, onDismiss, onRetry }) => {
  const getIcon = () => {
    switch (error.type) {
      case 'quota':
        return <Clock className="w-6 h-6 text-yellow-500" />;
      case 'api_key':
        return <Key className="w-6 h-6 text-red-500" />;
      case 'model_not_found':
        return <Brain className="w-6 h-6 text-orange-500" />;
      case 'timeout':
        return <Clock className="w-6 h-6 text-blue-500" />;
      case 'json_parse':
        return <FileX className="w-6 h-6 text-purple-500" />;
      case 'network':
        return <Wifi className="w-6 h-6 text-red-500" />;
      default:
        return <AlertTriangle className="w-6 h-6 text-red-500" />;
    }
  };

  const getBgColor = () => {
    switch (error.type) {
      case 'quota':
        return 'bg-yellow-500/10 border-yellow-500/30';
      case 'api_key':
        return 'bg-red-500/10 border-red-500/30';
      case 'model_not_found':
        return 'bg-orange-500/10 border-orange-500/30';
      case 'timeout':
        return 'bg-blue-500/10 border-blue-500/30';
      case 'json_parse':
        return 'bg-purple-500/10 border-purple-500/30';
      case 'network':
        return 'bg-red-500/10 border-red-500/30';
      default:
        return 'bg-red-500/10 border-red-500/30';
    }
  };

  const getTextColor = () => {
    switch (error.type) {
      case 'quota':
        return 'text-yellow-400';
      case 'api_key':
        return 'text-red-400';
      case 'model_not_found':
        return 'text-orange-400';
      case 'timeout':
        return 'text-blue-400';
      case 'json_parse':
        return 'text-purple-400';
      case 'network':
        return 'text-red-400';
      default:
        return 'text-red-400';
    }
  };

  return (
    <div className={`fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300`}>
      <div className={`bg-surface border ${getBgColor()} p-8 rounded-[2.5rem] max-w-md w-full shadow-2xl scale-in-center relative`}>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        
        <div className="flex flex-col items-center text-center space-y-4">
          <div className={`w-16 h-16 ${getBgColor()} rounded-full flex items-center justify-center border-2 ${getBgColor().replace('/10', '/20')}`}>
            {getIcon()}
          </div>
          
          <div className="space-y-2">
            <h3 className={`text-xl font-black ${getTextColor()} italic uppercase tracking-tight`}>
              {error.title}
            </h3>
            <p className="text-zinc-300 text-sm leading-relaxed font-medium">
              {error.message}
            </p>
            {error.details && (
              <p className="text-zinc-500 text-xs leading-relaxed mt-2">
                {error.details}
              </p>
            )}
            {error.retryAfter && error.retryAfter > 0 && (
              <div className="mt-4 p-3 bg-zinc-900/50 rounded-xl border border-zinc-700/50">
                <p className="text-yellow-400 text-xs font-mono">
                  ⏱️ Tiempo de espera: {error.retryAfter} segundos
                </p>
              </div>
            )}
          </div>
          
          <div className="flex flex-col gap-3 pt-4 w-full">
            {onRetry && (
              <button
                onClick={onRetry}
                disabled={error.retryAfter && error.retryAfter > 0}
                className={`w-full py-4 ${
                  error.retryAfter && error.retryAfter > 0
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-primary text-black hover:bg-primaryHover'
                } font-black rounded-2xl text-sm uppercase shadow-lg transition-all active:scale-95`}
              >
                {error.retryAfter && error.retryAfter > 0 ? `Espera ${error.retryAfter}s` : 'Reintentar'}
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="w-full py-4 bg-zinc-900 text-zinc-500 hover:text-white font-black rounded-2xl text-sm uppercase transition-colors"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

