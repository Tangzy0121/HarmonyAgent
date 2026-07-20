// App —— 知识学伴管理后台（占位，队友写前端）
//
// 功能规划：
//   左侧导航：知识库浏览 / 笔记管理 / 知识点 / 学习曲线 / 设置
//   主区域：根据导航切换内容
//
// 接手指南：
//   1. npm install → npm run dev (http://localhost:5173)
//   2. API 通过 /api/ 代理到 server (localhost:3456)
//   3. Tailwind CSS 已配好，直接用 className 写样式

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">📚 知识学伴</h1>
          <span className="text-sm text-gray-500">管理后台 v1.0</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Placeholder card */}
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-6xl mb-4">🚧</div>
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">
            前端开发中
          </h2>
          <p className="text-gray-500">
            队友正在构建管理后台界面。功能包括知识库浏览、笔记管理、知识点管理、学习曲线等。
          </p>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition">
            <h3 className="font-semibold text-lg mb-2">📝 笔记管理</h3>
            <p className="text-gray-500 text-sm">查看和管理已保存的笔记和文件</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition">
            <h3 className="font-semibold text-lg mb-2">🧠 知识点</h3>
            <p className="text-gray-500 text-sm">浏览和编辑自动抽取的知识点</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition">
            <h3 className="font-semibold text-lg mb-2">📊 学习曲线</h3>
            <p className="text-gray-500 text-sm">可视化知识掌握度变化和复习进度</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
