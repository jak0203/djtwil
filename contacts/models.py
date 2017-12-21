from django.db import models


class Person(models.Model):
    name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=15)
    # todo make it so you can add/edit this list in admin module
    PERSON_TYPES = (('E', 'employee'), ('C', 'customer'), ('U', 'unknown'))
    person_type = models.CharField(max_length=1, choices=PERSON_TYPES, default='')

