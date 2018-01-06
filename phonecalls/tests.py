from django.test import TestCase, Client
from django.test.utils import override_settings
from urllib import parse
from tests.data_generator import DataGenerator


class LoggedInViewsTestCase(TestCase):
    def setUp(self):
        user = DataGenerator.generate_user()
        self.client = Client()
        self.client.login(username=user['username'], password=user['password'])

    def test_capability_token(self):
        response = self.client.get('/phonecalls/capabilityToken/')
        self.assertEqual(response.status_code, 200)
        self.assertSetEqual(set(response.json().keys()), {'token', 'identity'})

    @override_settings(DEBUG=True)
    def test_voice_without_to(self):
        tvr = DataGenerator.generate_twilio_voice_request(**{
            'caller': 'client:j_react',
        })
        voice_response = ('<?xml version="1.0" encoding="UTF-8"?>'
                          '<Response><Say>Please enter a valid phone number.</Say></Response>')
        response = self.client.post(
            '/phonecalls/voice/',
            parse.urlencode(tvr),
            content_type='application/x-www-form-urlencoded'
        )
        self.assertEqual(voice_response, str(response.content, 'utf-8'))

    @override_settings(DEBUG=True)
    def test_voice(self):
        tvr = DataGenerator.generate_twilio_voice_request(**{
            'caller': 'client:j_react',
            'to': DataGenerator.generate_phonenumber()
        })

        voice_response = ('<?xml version="1.0" encoding="UTF-8"?>'
                          '<Response><Dial callerId="+15557654321">'
                          f'<Number>{tvr["To"]}</Number>'
                          '</Dial></Response>')
        response = self.client.post(
            '/phonecalls/voice/',
            parse.urlencode(tvr),
            content_type='application/x-www-form-urlencoded'
        )
        self.assertEqual(voice_response, str(response.content, 'utf-8'))

    @override_settings(DEBUG=True)
    def test_voice_client(self):
        tvr = DataGenerator.generate_twilio_voice_request(**{
            'caller': 'client:j_react',
            'to': 'j_react'
        })

        voice_response = ('<?xml version="1.0" encoding="UTF-8"?>'
                          '<Response><Dial callerId="+15557654321">'
                          f'<Client>{tvr["To"]}</Client>'
                          '</Dial></Response>')
        response = self.client.post(
            '/phonecalls/voice/',
            parse.urlencode(tvr),
            content_type='application/x-www-form-urlencoded'
        )
        self.assertEqual(voice_response, str(response.content, 'utf-8'))


class VerifyLoggedInTestCase(TestCase):
    def setUp(self):
        self.client = Client()

    def test_capability_token(self):
        response = self.client.get('/phonecalls/capabilityToken')
        self.assertEqual(response.status_code, 401)
