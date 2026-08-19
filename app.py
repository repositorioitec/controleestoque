from flask import Flask, request, jsonify
import os
import sqlite3
from models import Trip, db_session, init_db, func

app = Flask(__name__)

# Ensure database exists and tables are created
DB_URL = "postgresql://postgres:##Sup568935@db.eeuszlbhxkmilcdwvsqc.supabase.co:5432/postgres"
# No local SQLite directory needed for PostgreSQL
# Ensure the connection can be established (optional)
init_db(DB_URL)

@app.route('/api/trip', methods=['POST'])
def add_trip():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid JSON'}), 400
    try:
        trip = Trip(km=data['km'], cargo_kg=data['cargoKg'], fine=data['fine'], price=data['price'])
        db_session.add(trip)
        db_session.commit()
        return jsonify({'status': 'success'}), 201
    except Exception as e:
        db_session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        result = db_session.query(
            func.sum(Trip.km).label('total_km'),
            func.sum(Trip.cargo_kg).label('total_cargo'),
            func.sum(Trip.fine).label('total_fine'),
            func.sum(Trip.price).label('total_price')
        ).first()
        total = {
            'total_km': result.total_km or 0,
            'total_cargo': result.total_cargo or 0,
            'total_fine': result.total_fine or 0,
            'total_price': result.total_price or 0,
        }
        return jsonify(total), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
