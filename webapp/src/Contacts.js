import React, {Component} from 'react'
// import axios from "axios/index";
import axios from 'axios';
import {Toolbar, ToolbarTitle} from 'material-ui/Toolbar';
import {
  Table,
  TableBody,
  TableHeader,
  TableHeaderColumn,
  TableRow,
  TableRowColumn,
} from 'material-ui/Table';
import Paper from 'material-ui/Paper'

const PaperStyle = {
  // height: 00,
  width: 400,
  margin: 20,
  padding: 20,
  textAlign: 'center',
  display: 'inline-block',
};

// render contact list
class ContactList extends Component {
  render() {
    let {contactList} = this.props;
    return (
      <Table
        selectable={true}
      >
        <TableHeader>
          <TableRow>
            <TableHeaderColumn>Name</TableHeaderColumn>
            <TableHeaderColumn>Phone Number</TableHeaderColumn>
          </TableRow>
        </TableHeader>
        <TableBody
          stripedRows={true}
          deselectOnClickaway={true}
        >
          {contactList.map(({phone_number, name = "Unknown"}) => {
            return(
              <TableRow key={name} onClick={() => this.props.onNumberSelect(phone_number)}>
                <TableRowColumn>{name}</TableRowColumn>
                <TableRowColumn>{phone_number}</TableRowColumn>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }
}

class Contacts extends Component {
  state = {
    contacts: [],
  };


  getContactList = () => {
    axios.get('/api/contacts/')
      .then(res => {
        console.log(res);
        this.setState({contacts: res.data})
      })
  };

  componentDidMount = () => {
    this.getContactList();
  };

  render() {
    return(
      <div className={'App'}>
        <Paper style={PaperStyle} zDepth={4}>
          <Toolbar><ToolbarTitle text='Contacts' /></Toolbar>
          <ContactList
            contactList={this.state.contacts}
            onNumberSelect={this.onNumberSelect}
          />
        </Paper>
      </div>
    )
  }
}

export default Contacts