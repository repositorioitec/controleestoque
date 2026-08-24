import webbrowser
import threading
import time
from app import app

def open_browser():
    time.sleep(1.5)
    webbrowser.open('http://127.0.0.1:5000')

if __name__ == '__main__':
    print("=========================================================")
    print("  INICIANDO CONTROLE DE ESTOQUES - ITEC")
    print("=========================================================")
    print(" Servidor web rodando em: http://127.0.0.1:5000")
    print(" Pressione Ctrl+C para encerrar o servidor.")
    print("=========================================================")

    threading.Thread(target=open_browser).start()
    app.run(host='127.0.0.1', port=5000, debug=False)
