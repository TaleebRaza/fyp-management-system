import React from 'react';
import { CheckCircle, Circle, FileText } from 'lucide-react';

const STAGES = [
  { id: 'PROPOSAL', label: 'Proposal Stage' },
  { id: 'THESIS_DRAFT', label: 'Thesis Chapters' },
  { id: 'FINAL_DELIVERABLES', label: 'Final Submission' }
];

export const Timeline = ({ currentStage, isDarkMode, theme }: { currentStage: string, isDarkMode: boolean, theme: any }) => {
  const currentIndex = STAGES.findIndex(s => s.id === currentStage) || 0;

  return (
    <div className={`w-full p-6 rounded-2xl border mb-6 ${isDarkMode ? 'bg-neutral-800/30 border-neutral-700/50' : 'bg-neutral-50/50 border-neutral-200/50'}`}>
      <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-6">Project Timeline</h4>
      <div className="flex items-center justify-between relative">
        {/* Connecting Line */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full z-0"></div>
        <div 
          className={`absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full z-0 transition-all duration-700 ${theme.bg}`}
          style={{ width: `${(currentIndex / (STAGES.length - 1)) * 100}%` }}
        ></div>

        {STAGES.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          
          return (
            <div key={stage.id} className="relative z-10 flex flex-col items-center gap-2 bg-transparent">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 transition-all duration-500 ${
                isCompleted ? `${theme.bg} border-transparent text-white` : 
                isActive ? `${isDarkMode ? 'bg-neutral-900' : 'bg-white'} ${theme.border} ${theme.text} shadow-lg scale-110` : 
                `${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-neutral-500' : 'bg-white border-neutral-300 text-neutral-400'}`
              }`}>
                {isCompleted ? <CheckCircle size={20} /> : isActive ? <FileText size={18} /> : <Circle size={16} />}
              </div>
              <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider text-center max-w-[80px] sm:max-w-none ${isActive ? theme.text : 'opacity-50'}`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};