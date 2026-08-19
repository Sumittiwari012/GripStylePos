

import './App.css'
import Pdtsection from './Components/pdtsection'
import { Routes, Route } from "react-router-dom";
import Accounts from "./Components/accounts";

function App() {
  
  return (
    <>
      <Routes>
            <Route path="/" element={<Pdtsection />} />
            <Route path="/accounts" element={<Accounts />} />
            
        </Routes>
      
    </>
  )
}

export default App
