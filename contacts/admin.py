from django.contrib import admin

from .models import Person


class PersonAdmin(admin.ModelAdmin):
    # define which columns displayed in changelist
    list_display = ('name', 'phone_number')
    # add filtering by date
    list_filter = ('name',)
    # add search field
    search_fields = ['name', 'phone_number']


# Register your models here.
admin.site.register(Person, PersonAdmin)
