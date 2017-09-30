from django.shortcuts import render
from django.views import generic
from django.utils.decorators import method_decorator
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse



CONTACTS = [
    {'name': 'Twilio Test phone', 'number': '+15126653351', 'type': 'test'},
    {'name': 'Danny Cell', 'number': '+15125658782', 'type': 'human'},
    {'name': 'Jacki Cell', 'number': '+15129648470', 'type': 'human'}
]

class listView(generic.ListView):
    '''This is a temporary view that is used to generate a page that has a list of contacts.'''
    template_name = 'contacts/index.html'
    context_object_name = 'contact_list'
    queryset = CONTACTS

    @method_decorator(login_required(login_url='/admin/login/'))
    def dispatch(self, *args, **kwargs):
        return super(listView, self).dispatch(*args, **kwargs)



@require_http_methods(['POST'])
@csrf_exempt
def contacts(request):
    '''This is a temporary endpoint that will eventually be moved to it's own app. 
    For now I am faking a contact list, but eventually will store info in DB'''

    return HttpResponse(CONTACTS)
