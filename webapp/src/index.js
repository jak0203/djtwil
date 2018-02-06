import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom'
import './index.css';
// import App from './App';
import App2 from './App2';
import registerServiceWorker from './registerServiceWorker';


ReactDOM.render(<BrowserRouter><App2 /></BrowserRouter>, document.getElementById('root'));
registerServiceWorker();
