from django.shortcuts import render
from django.views import generic
from django.utils.decorators import method_decorator
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import api_view
from .models import Person
from .serializers import PersonSerializer


class listView(generic.ListView):
    """This is a temporary view that is used to generate a page that has a list of contacts."""
    template_name = 'contacts/index.html'
    context_object_name = 'contact_list'
    queryset = Person.objects.all()

    @method_decorator(login_required(login_url='/admin/login/'))
    def dispatch(self, *args, **kwargs):
        return super(listView, self).dispatch(*args, **kwargs)


class PersonViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows users to be viewed or edited.
    """
    queryset = Person.objects.all().order_by('id')
    serializer_class = PersonSerializer


@require_http_methods(['GET'])
@csrf_exempt
def contacts(request):
    """
    :param request:
    :return: all contacts
    """
    # todo add the option for query parameters
    return HttpResponse(Person.objects.all())

