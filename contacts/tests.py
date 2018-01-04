from django.test import TestCase, Client
from tests.data_generator import DataGenerator


class ContactsApiTestCase(TestCase):
    def setUp(self):
        dg = DataGenerator()
        user = dg.generate_user()

        contacts = []
        for i in range(3):
            contacts.append(dg.generate_contact)

        self.client = Client()
        self.client.login(username=user['username'], password=user['password'])

    def test_contacts_list_view(self):
        response = self.client.get('/api/contacts/')
        self.assertEqual(response.status_code, 200)
        for p in response.json():
            self.assertSetEqual(set(p.keys()), {'name', 'phone_number', 'person_type'})
        # also need to assert that the list returned matches the contacts created


