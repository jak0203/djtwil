import os

from django.contrib.auth.models import User, Group
from django.views.generic import View
from django.http import HttpResponse
from django.conf import settings

from rest_framework import viewsets

from .serializers import UserSerializer, GroupSerializer


class UserViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows users to be viewed or edited.
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer


class GroupViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows groups to be viewed or edited.
    """
    queryset = Group.objects.all()
    serializer_class = GroupSerializer


class ReactAppView(View):
    def get(self, request):
        try:
            with open(os.path.join(settings.REACT_APP, 'build', 'index.html')) as file:
                return HttpResponse(file.read())
        except:
            return HttpResponse(
                """
                index.html not found ! build your React app !!
                """,
                status=501,
            )
