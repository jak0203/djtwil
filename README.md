# Django-Twilio Backend + React Dialer
A django backend server to handle Twilio calls and a frontend React web dialer.

### Prerequisites
1. Python (version 3.6 or higher)
2. Pip
3. Node.js (version 6 or higher)
4. A Twilio account
5. Ngrok

### Local Development
1. Clone this repository and cd into it
2. Install the python requirements

    ```
    $ pip install -r requirements.txt
    ```

3. Cd into webapp and install react

    ```
    $ cd webapp
    $ npm install
    ```

4. Set up ngrok

5. Set up Twilio

6. Start servers
    ```
    $ foreman start -f Procfile.local
    ```

### Deploy to Heroku


### Development notes
#### get auth token
POST to api/token with your username and password to retrieve your api token.
Sample Request

    $ curl -X "POST" "http://localhost:5000/api/token/" \
         -H 'Content-Type: application/json; charset=utf-8' \
         -d $'{
      "username": "USERNAME",
      "password": "PASSWORD"
    }'

Sample Response

    HTTP/1.0 200 OK
    Date: Tue, 19 Dec 2017 03:04:09 GMT
    Server: WSGIServer/0.2 CPython/3.5.1
    Content-Type: application/json
    Allow: POST, OPTIONS
    X-Frame-Options: SAMEORIGIN
    Content-Length: 52
    Vary: Cookie
    
    {"token":"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}

#### get twilio token
GET phonecalls/capabilityToken/ - pass the api token in as a header to the request
Sample Request

    $ curl "http://localhost:5000/phonecalls/capabilityToken/" \
         -H 'Authorization: Token XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' \
         -H 'Accept: application/json'

Sample Response (token is returned as a string):

    HTTP/1.0 200 OK
    Date: Tue, 19 Dec 2017 03:02:41 GMT
    Server: WSGIServer/0.2 CPython/3.5.1
    X-Frame-Options: SAMEORIGIN
    Allow: OPTIONS, POST, GET
    Vary: Accept
    Content-Length: 575
    Content-Type: text/html; charset=utf-8
    
    {"identity": USER, "token": VERY_LONG_TOKEN}


#### License: MIT

#### Further Reading

- [Gunicorn](https://warehouse.python.org/project/gunicorn/)
- [WhiteNoise](https://warehouse.python.org/project/whitenoise/)
- [dj-database-url](https://warehouse.python.org/project/dj-database-url/)
