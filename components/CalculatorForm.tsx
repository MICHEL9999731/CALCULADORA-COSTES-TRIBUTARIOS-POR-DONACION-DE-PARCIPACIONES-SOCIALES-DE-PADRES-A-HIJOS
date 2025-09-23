
import React, { useState } from 'react';
import { type FormData } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Button } from './ui/Button';
import { InfoTooltip } from './InfoTooltip';

interface CalculatorFormProps {
    onCalculate: (formData: FormData) => void;
}

const initialFormData: FormData = {
    totalShares: 1000,
    nominalValuePerShare: 30,
    totalEquity: 500000,
    averageProfit: 60000,
    isAssetHoldingCompany: false,
    donatedShares: 200,
    acquisitionValuePerShare: 50,
    donorAge: 70,
    donorStopsManagement: true,
    preExistingWealth: 100000,
};

export const CalculatorForm: React.FC<CalculatorFormProps> = ({ onCalculate }) => {
    const [formData, setFormData] = useState<FormData>(initialFormData);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : parseFloat(value) || 0,
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onCalculate(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company Data */}
            <Card>
                <CardHeader>
                    <CardTitle>1. Datos de la Sociedad</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="totalShares">Nº Total de Participaciones</Label>
                        <Input id="totalShares" name="totalShares" type="number" value={formData.totalShares} onChange={handleChange} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="nominalValuePerShare">Valor Nominal por Participación (€)</Label>
                        <Input id="nominalValuePerShare" name="nominalValuePerShare" type="number" value={formData.nominalValuePerShare} onChange={handleChange} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="totalEquity">
                            Patrimonio Neto del último balance (€)
                            <InfoTooltip text="El 'Patrimonio Neto' se encuentra en el pasivo del balance de situación de la sociedad." />
                        </Label>
                        <Input id="totalEquity" name="totalEquity" type="number" value={formData.totalEquity} onChange={handleChange} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="averageProfit">
                            Beneficio promedio de los 3 últimos años (€)
                            <InfoTooltip text="Suma de los resultados de los 3 últimos ejercicios cerrados, dividido entre 3. Puede ser negativo." />
                        </Label>
                        <Input id="averageProfit" name="averageProfit" type="number" value={formData.averageProfit} onChange={handleChange} />
                    </div>
                     <div className="md:col-span-2 flex items-center space-x-2 mt-2">
                        <input
                            type="checkbox"
                            id="isAssetHoldingCompany"
                            name="isAssetHoldingCompany"
                            checked={formData.isAssetHoldingCompany}
                            onChange={handleChange}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <Label htmlFor="isAssetHoldingCompany" className="flex items-center">
                            ¿Es una sociedad patrimonial?
                            <InfoTooltip text="Una sociedad se considera patrimonial cuando más de la mitad de su activo no está afecto a una actividad económica." />
                        </Label>
                    </div>
                </CardContent>
            </Card>

            {/* Donation Data */}
            <Card>
                <CardHeader>
                    <CardTitle>2. Datos de la Donación</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="donatedShares">Nº de Participaciones a Donar</Label>
                        <Input id="donatedShares" name="donatedShares" type="number" value={formData.donatedShares} onChange={handleChange} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="acquisitionValuePerShare">
                            Coste de Adquisición por Participación (€)
                             <InfoTooltip text="El precio que pagó el donante (padre/madre) cuando adquirió originalmente las participaciones." />
                        </Label>
                        <Input id="acquisitionValuePerShare" name="acquisitionValuePerShare" type="number" value={formData.acquisitionValuePerShare} onChange={handleChange} />
                    </div>
                </CardContent>
            </Card>

            {/* Parties Data */}
            <Card>
                <CardHeader>
                    <CardTitle>3. Datos de las Partes</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Donor */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-slate-300 border-b border-slate-700 pb-1">Donante (Padre/Madre)</h4>
                        <div className="space-y-1">
                            <Label htmlFor="donorAge">Edad del Donante</Label>
                            <Input id="donorAge" name="donorAge" type="number" value={formData.donorAge} onChange={handleChange} />
                        </div>
                         <div className="flex items-center space-x-2 mt-2">
                            <input
                                type="checkbox"
                                id="donorStopsManagement"
                                name="donorStopsManagement"
                                checked={formData.donorStopsManagement}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <Label htmlFor="donorStopsManagement" className="flex items-center">
                                Cesa en funciones de dirección
                                <InfoTooltip text="Marcar si el donante dejará de ejercer funciones de dirección y de percibir remuneraciones por ello tras la donación. Es un requisito para la exención en IRPF." />
                            </Label>
                        </div>
                    </div>
                    {/* Donee */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-slate-300 border-b border-slate-700 pb-1">Donatario (Hijo/a)</h4>
                        <div className="space-y-1">
                            <Label htmlFor="preExistingWealth">
                                Patrimonio Preexistente del Donatario (€)
                                <InfoTooltip text="Valor del patrimonio total del hijo/a antes de recibir la donación. Afecta al coeficiente multiplicador en el Impuesto de Donaciones." />
                            </Label>
                            <Input id="preExistingWealth" name="preExistingWealth" type="number" value={formData.preExistingWealth} onChange={handleChange} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end mt-8">
                <Button type="submit">
                    Calcular Impuestos
                </Button>
            </div>
        </form>
    );
};
