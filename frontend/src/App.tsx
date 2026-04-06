import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'

// Placeholder pages — Tasks 5 and 6 will replace these
function WizardPage() {
  return <div className="text-gray-500">Wizard coming soon (Task 5)</div>
}
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
