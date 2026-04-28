import React from "react";

export const GlassCard = ({ children, className = "", isDarkMode }: any) => (
  <div className={`p-8 rounded-[2rem] border backdrop-blur-2xl transition-all duration-500 ${isDarkMode ? 'bg-neutral-900/80 border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.1)]' : 'bg-white/80 border-neutral-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'} ${className}`}>
    {children}
  </div>
);

export const StyledInput = ({ icon: Icon, isDarkMode, theme, disabled, ...props }: any) => (
  <div className="relative group">
    {Icon && <Icon className={`absolute left-4 top-3.5 transition-colors duration-300 ${disabled ? 'opacity-30' : (isDarkMode ? 'text-neutral-500 group-focus-within:text-white' : 'text-neutral-400 group-focus-within:text-black')}`} size={20} />}
    <input 
      disabled={disabled}
      className={`w-full ${Icon ? 'pl-12' : 'pl-4'} pr-4 py-3.5 rounded-2xl border-2 border-transparent transition-all duration-300 outline-none 
      ${isDarkMode ? 'bg-neutral-800 text-white placeholder-neutral-500' : 'bg-neutral-100/70 text-black placeholder-neutral-400'} 
      ${disabled ? 'opacity-50 cursor-not-allowed' : `${theme.ring} focus:bg-transparent`}`} 
      {...props} 
    />
  </div>
);