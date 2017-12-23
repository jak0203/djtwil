import React, { Component } from 'react';
import axios from 'axios';
import logo from './logo.svg';
import './App.css';

class App extends Component {
  render() {
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Welcome to React</h1>
        </header>
        <p className="App-intro">
          To get started, edit <code>src/App.js</code> and save to reload.
        </p>
          <button type="button" onClick={this.onClick}>Send GET /contacts </button>
      </div>
    );
  }

  onClick(ev) {
    console.log("Sending a GET API Call !!!");
    axios.get('/api/contacts/')
    .then(res => {
            console.log(res)
    }).then(response => {
        console.log(JSON.stringify(response));
    })
    }
}

export default App;
