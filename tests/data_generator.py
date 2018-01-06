from django.contrib.auth.models import User
from faker import Faker
from random import randint, choice
from contacts.models import Person
from django.conf import settings
import string


class DataGenerator:
    fake = Faker()

    @classmethod
    def generate_user(cls):
        user = {
            'username': cls.fake.simple_profile()['username'],
            'email': cls.fake.safe_email(),
            'password': 'foo',
        }
        User.objects.create_user(**user)
        return user

    @classmethod
    def generate_contact(cls):
        contact = {
            'name': cls.fake.name(),
            'phone_number': cls.generate_phonenumber(),
            'person_type': 'ECU'[randint(0, 2)]
        }
        Person.objects.create(**contact)
        return contact

    @classmethod
    def generate_phonenumber(cls):
        return f'+1{str(randint(100000000, 999999999))}'

    @classmethod
    def generate_twilio_voice_request(cls, caller, to=None):
        tvr = {
            'AccountSid': settings.TWILIO_ACCOUNT_SID,
            'ApiVersion': '2010-04-01',
            'ApplicationSid': settings.TWILIO_APP_SID,
            'CallSid': f'CA{cls.generate_callsid()}',
            'CallStatus': 'ringing',
            'Caller': caller,
            'Direction': 'inbound',
            'From': caller,
        }
        if to:
            tvr['To'] = to
        return tvr

    @classmethod
    def generate_callsid(cls):
        return ''.join(choice(string.ascii_lowercase + string.digits) for _ in range(32))
