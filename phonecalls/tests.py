from django.contrib.auth.models import User
from django.test import TestCase, Client
from django.test.utils import override_settings
from urllib import parse
from django.conf import settings


class LoggedInViewsTestCase(TestCase):
    twilio_voice_request = {
        'AccountSid': settings.TWILIO_ACCOUNT_SID,
        'ApiVersion': '2010-04-01',
        'ApplicationSid': settings.TWILIO_APP_SID,
        'CallSid': 'CA248e26ea9235cf50e423e97356ff2078',
        'CallStatus': 'ringing',
        'Caller': 'client:jacki_reactweb',
        'Direction': 'inbound',
        'From': 'client:jacki_reactweb',
    }

    def setUp(self):
        User.objects.create_user('test_user', 'testemail@test.com', 'foo')
        self.client = Client()
        self.client.login(username='test_user', password='foo')

    def test_capability_token(self):
        response = self.client.get('/phonecalls/capabilityToken/')
        self.assertEqual(response.status_code, 200)
        self.assertSetEqual(set(response.json().keys()), {'token', 'identity'})

    @override_settings(DEBUG=True)
    def test_voice_without_to(self):
        voice_response = ('<?xml version="1.0" encoding="UTF-8"?>'
                          '<Response><Say>Please enter a valid phone number.</Say></Response>')
        response = self.client.post(
            '/phonecalls/voice/',
            parse.urlencode(self.twilio_voice_request),
            content_type='application/x-www-form-urlencoded'
        )
        self.assertEqual(voice_response, str(response.content, 'utf-8'))

    @override_settings(DEBUG=True)
    def test_voice(self):
        tvr = self.twilio_voice_request.copy()
        tvr['To'] = '+15551234567'

        voice_response = ('<?xml version="1.0" encoding="UTF-8"?>'
                          '<Response><Dial callerId="+15557654321">'
                          '<Number>+15551234567</Number>'
                          '</Dial></Response>')
        response = self.client.post(
            '/phonecalls/voice/',
            parse.urlencode(tvr),
            content_type='application/x-www-form-urlencoded'
        )
        self.assertEqual(voice_response, str(response.content, 'utf-8'))

    @override_settings(DEBUG=True)
    def test_voice_client(self):
        tvr = self.twilio_voice_request.copy()
        tvr['To'] = 'jacki_react'

        voice_response = ('<?xml version="1.0" encoding="UTF-8"?>'
                          '<Response><Dial callerId="+15557654321">'
                          '<Client>jacki_react</Client>'
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
