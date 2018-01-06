from rest_framework import serializers

from .models import Person


class PersonSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Person
        fields = ('name', 'phone_number', 'person_type')
