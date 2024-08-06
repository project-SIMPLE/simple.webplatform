import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { BrowserRouter, Route, BrowserRouter as Router, Routes } from "react-router-dom";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// const container = document.getElementById('root')!;
// const root = createRoot(container);

// export default function App() {
//     return (
//       <BrowserRouter>
//     <Routes>
//             <Route path='/' element={<Layout/>}>
//                 <Route index element={<Accueil />} />
//                 <Route path="clients" element={<DisplayClients />} />
//                 {/* <Route path="articles" element={<DisplayArticles/>} />          
//                 <Route path="/BCN1" element={<CommandeNouveautes />} />
//                 <Route path="*" element={<Error404 />} /> */}
//             </Route>

//         </Routes>
        
//     </BrowserRouter>
// );
// }
