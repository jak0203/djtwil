from django.contrib.auth.models import User
from django.test import TestCase, Client


class LoggedInViewsTestCase(TestCase):
    def setUp(self):
        user = User.objects.create_user('test_user', 'testemail@test.com', 'foo')
        self.client = Client()
        self.client.login(username='test_user', password='foo')

    def test_capability_token(self):
        response = self.client.get('/phonecalls/capabilityToken/')
        self.assertEqual(response.status_code, 200)
        self.assertSetEqual(set(response.json().keys()), {'token', 'identity'})


class VerifyLoggedInTestCase(TestCase):
    def setUp(self):
        self.client = Client()

    def test_capability_token(self):
        response = self.client.get('/phonecalls/capabilityToken')
        self.assertEqual(response.status_code, 401)
