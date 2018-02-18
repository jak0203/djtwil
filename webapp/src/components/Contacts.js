import React, {Component} from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import { styles } from './Style';
import { withStyles } from 'material-ui/styles';

import Table, {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
} from 'material-ui/Table';

import { contactsFetchData } from "./actions/contacts";

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
  // state = {
  //   contacts: [],
  // };

  //
  // getContactList = () => {
  //   axios.get('/api/contacts/')
  //     .then(res => {
  //       console.log(res);
  //       this.setState({contacts: res.data})
  //     })
  // };

  componentDidMount = () => {
    // this.getContactList();
    this.props.fetchData('/api/contacts/')
  };

  render() {
    // if (this.props.hasErrored) {
    //         return <p>Sorry! There was an error loading the items</p>;
    //     }
    //     if (this.props.isLoading) {
    //         return <p>Loading…</p>;
    //     }
    return(
      <div className={'App'}>
        <Paper style={PaperStyle} zDepth={4}>
          <Toolbar><ToolbarTitle text='Contacts' /></Toolbar>
          <ContactList
            contactList={this.props.contacts.contacts}
            onNumberSelect={this.onNumberSelect}
          />
        </Paper>
      </div>
    )
  }
}

const mapStateToProps = (state) => {
    return {
        contacts: state.contacts,
        hasErrored: state.contactsHasErrored,
        isLoading: state.contactsIsLoading
    };
};

const mapDispatchToProps = (dispatch) => {
    return {
        fetchData: (url) => dispatch(contactsFetchData(url))
    };
};

Contacts.propTypes = {
  classes: PropTypes.object.isRequired,
  theme: PropTypes.object.isRequired,
};

export default withStyles(styles, {withTheme: true})(connect(mapStateToProps, mapDispatchToProps)(Contacts));
//
// export default Contacts