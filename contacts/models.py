from django.db import models

# Create your models here.
class Person(models.Model):
    name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=11)
    PERSON_TYPES = (('E', 'employee'), ('C', 'customer'), ('U', 'unknown'))
    person_type = models.CharField(max_length=1, choices=PERSON_TYPES, default='')

#todo Need information on app names for persons
