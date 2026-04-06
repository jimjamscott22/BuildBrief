import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import WizardPage from './pages/WizardPage'

// Placeholder page — Task 6 will replace this
function ResultsPage() {
  return <div className="text-gray-500">Results coming soon (Task 6)</div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/wizard" replace />} />
          <Route path="/wizard" element={<WizardPage />} />
          <Route path="/results/:id" element={<ResultsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
