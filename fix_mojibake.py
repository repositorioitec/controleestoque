import os

replacements = {
    'ÃƒÂ£': 'ã',
    'ÃƒÂ§': 'ç',
    'ÃƒÂ¡': 'á',
    'ÃƒÂ©': 'é',
    'ÃƒÂ­': 'í',
    'ÃƒÂ³': 'ó',
    'ÃƒÂº': 'ú',
    'ÃƒÂ¢': 'â',
    'ÃƒÂª': 'ê',
    'ÃƒÂ´': 'ô',
    'ÃƒÂµ': 'õ',
    'ÃƒÂ ': 'Á',
    'SAÃƒÂ DA': 'SAÍDA',
    'SaÃƒÂda': 'Saída',
    'SAÃƒÂ DAS': 'SAÍDAS',
    'SaÃƒÂdas': 'Saídas',
    'Ã¢â‚¬â€': '—',
    'Ãƒâ€¡ÃƒÆ’O': 'ÇÃO',
    'Ãƒâ€¡Ãƒâ€': 'ÇÕES',
    'ÃƒÂµes': 'ões',
    'ÃƒÂ§ÃƒÂ£o': 'ção',
    'ÃƒÂ§ÃƒÂµes': 'ções',
    'NÃƒÂ£o': 'Não',
    'VisÃƒÂ£o': 'Visão',
    'NÃƒÂ VEL': 'NÍVEL',
    'ESTÃƒÂ TICO': 'ESTÁTICO',
    'ÃƒÂ¡rios': 'ários',
    'UsuÃƒÂ¡rio': 'Usuário',
    'usuÃƒÂ¡rio': 'usuário',
    'LanÃƒÂ§amento': 'Lançamento',
    'lanÃƒÂ§amento': 'lançamento',
    'PreÃƒÂ§o': 'Preço',
    'preÃƒÂ§o': 'preço',
    'AtualizaÃƒÂ§ÃƒÂ£o': 'Atualização',
    'atualizaÃƒÂ§ÃƒÂ£o': 'atualização',
    'MovimentaÃƒÂ§ÃƒÂ£o': 'Movimentação',
    'movimentaÃƒÂ§ÃƒÂ£o': 'movimentação',
    'AprovaÃƒÂ§ÃƒÂ£o': 'Aprovação',
    'aprovaÃƒÂ§ÃƒÂ£o': 'aprovação',
    'PermissÃƒÂµes': 'Permissões',
    'permissÃƒÂµes': 'permissões',
    'TransferÃƒÂªncia': 'Transferência',
    'transferÃƒÂªncia': 'transferência',
    'ExcluÃƒÂ­do': 'Excluído',
    'excluÃƒÂ­do': 'excluído',
    'InacessÃƒÂ­vel': 'Inacessível',
    'inacessÃƒÂ­vel': 'inacessível',
    'AutomÃƒÂ¡tico': 'Automático',
    'automÃƒÂ¡tico': 'automático',
    'EletrÃƒÂ´nicos': 'Eletrônicos',
    'eletrÃƒÂ´nicos': 'eletrônicos',
    'EscritÃƒÂ³rio': 'Escritório',
    'escritÃƒÂ³rio': 'escritório',
    'InformÃƒÂ¡tica': 'Informática',
    'informÃƒÂ¡tica': 'informática',
    'FunÃƒÂ§ao': 'Função',
    'funÃƒÂ§ao': 'função',
    'PÃƒÂ¡gina': 'Página',
    'pÃƒÂ¡gina': 'página',
    'InvÃƒÂ¡lido': 'Inválido',
    'invÃƒÂ¡lido': 'inválido',
    'DisponÃƒÂ­vel': 'Disponível',
    'disponÃƒÂ­vel': 'disponível',
    'ÃƒÂºnico': 'único',
    'ÃƒÂºltimo': 'último',
    'ÃƒÂºteis': 'úteis',
    'CÃƒâ€œDIGO': 'CÓDIGO',
    'ESTÃƒÂ GIOS': 'ESTÁGIOS',
    'SUGESTÃƒÆ’O': 'SUGESTÃO',
    'GESTÃƒÆ’O': 'GESTÃO',
    'ÃƒÆ’O': 'ÃO',
    'Ãƒâ€œ': 'Ó',
    'ÃƒÂ': 'Í', # apply last
}

def fix_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf8') as f:
            content = f.read()
    except Exception as e:
        print(f'Could not read {filepath}: {e}')
        return
        
    new_content = content
    for k in sorted(replacements.keys(), key=len, reverse=True):
        new_content = new_content.replace(k, replacements[k])
        
    if new_content != content:
        try:
            with open(filepath, 'w', encoding='utf8') as f:
                f.write(new_content)
            print(f'Fixed {filepath}')
        except Exception as e:
            print(f'Could not write {filepath}: {e}')

for root, _, files in os.walk('.'):
    # Skip .git or node_modules or other system folders if they exist
    if '.git' in root or 'node_modules' in root:
        continue
    for f in files:
        if f.endswith('.js') or f.endswith('.html') or f.endswith('.css'):
            fix_file(os.path.join(root, f))
