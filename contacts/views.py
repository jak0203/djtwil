from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.views import generic
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from rest_framework import viewsets

from .models import Person
from .serializers import PersonSerializer


class ContactListView(generic.ListView):
    """This is a temporary view that is used to generate a page that has a list of contacts."""
    template_name = 'contacts/index.html'
    context_object_name = 'contact_list'
    queryset = Person.objects.all()

    @method_decorator(login_required(login_url='/admin/login/'))
    def dispatch(self, *args, **kwargs):
        return super(ContactListView, self).dispatch(*args, **kwargs)


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
