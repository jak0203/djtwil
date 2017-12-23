"""djtwil URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/1.11/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  url(r'^$', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  url(r'^$', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.conf.urls import url, include
    2. Add a URL to urlpatterns:  url(r'^blog/', include('blog.urls'))
"""

from django.conf.urls import include, url
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.contrib.auth.decorators import login_required

from django.conf.urls import url, include
from rest_framework import routers
from rest_framework.authtoken import views as rest_views

from . import views
from contacts import views as contact_views


# Rest API routes
router = routers.DefaultRouter()
router.register(r'users', views.UserViewSet)
router.register(r'groups', views.GroupViewSet)
router.register(r'contacts', contact_views.PersonViewSet)


urlpatterns = [
    url(r'^$', login_required(views.ReactAppView.as_view(), login_url='/admin/login')),

    url(r'^admin/', admin.site.urls),
    url(r'^login/', auth_views.login, name='login'),
    url(r'^logout/$', auth_views.logout, name='logout'),

    url(r'^api/', include(router.urls)),
    url(r'^api/token/', rest_views.obtain_auth_token),

    url(r'^phonecalls/', include('phonecalls.urls'))
]
