export default function Header({ user, onToggleTheme, theme }) {
  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 sticky top-0 z-10">
      <div className="flex-1 max-w-xl">
        <div className="relative group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
            search
          </span>
          <input 
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-primary/20 text-sm placeholder:text-slate-500 outline-none" 
            placeholder="Search contacts, companies, or tasks..." 
            type="text"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-4 ml-8">
        <button 
          onClick={onToggleTheme}
          className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span className="material-symbols-outlined">
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
        
        <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg relative">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        
        <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg">
          <span className="material-symbols-outlined">settings</span>
        </button>
        
        <div className="h-8 w-px bg-slate-200 mx-2"></div>
        
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-slate-900 leading-none">
              {user?.email?.split('@')[0] || 'User'}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-tighter">Sales Director</p>
          </div>
          <div className="w-10 h-10 rounded-full border-2 border-slate-100 object-cover bg-slate-200 flex items-center justify-center overflow-hidden">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full" />
            ) : (
              <span className="material-symbols-outlined text-slate-400">person</span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
