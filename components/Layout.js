import Sidebar from './Sidebar'

export default function Layout({ children, theme, toggleTheme }) {
  return (
    <div className="min-h-screen bg-secondary transition-colors duration-200">
      <Sidebar theme={theme} toggleTheme={toggleTheme} />
      <main className="ml-20 overflow-x-hidden min-h-screen">
        <div className="max-w-[1600px] mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
