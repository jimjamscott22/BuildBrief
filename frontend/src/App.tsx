import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import WizardPage from './pages/WizardPage'
import ResultsPage from './pages/ResultsPage'

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
