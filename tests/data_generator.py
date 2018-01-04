from django.contrib.auth.models import User
from faker import Faker
from random import randint, choice
from contacts.models import Person
from django.conf import settings
import string




class DataGenerator:
    def __init__(self):
        self.fake = Faker()

    def generate_user(self):
        user = {
            'username': self.fake.simple_profile()['username'],
            'email': self.fake.safe_email(),
            'password': 'foo',
        }
        User.objects.create_user(**user)
        return user

    def generate_contact(self):
        contact = {
            'name': self.fake.name(),
            'phone_number': self.generate_phonenumber(),
            'person_type': 'ECU'[randint(0, 2)]
        }
        Person.objects.create(**contact)
        return contact

    def generate_phonenumber(self):
        return f'+1{str(randint(100000000, 999999999))}'

    def generate_twilio_voice_request(self, caller, to=None):
        tvr = {
            'AccountSid': settings.TWILIO_ACCOUNT_SID,
            'ApiVersion': '2010-04-01',
            'ApplicationSid': settings.TWILIO_APP_SID,
            'CallSid': f'CA{self.generate_callsid()}',
            'CallStatus': 'ringing',
            'Caller': caller,
            'Direction': 'inbound',
            'From': caller,
        }
        if to:
            tvr['To'] = to
        return tvr

    def generate_callsid(self):
        return ''.join(choice(string.ascii_lowercase + string.digits) for _ in range(32))

