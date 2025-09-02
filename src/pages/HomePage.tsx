import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ROUTES, BNGDRASIL_PROJECTS, APP_CONFIG } from '@/utils/constants';
import {
  ArrowRightIcon,
  CloudIcon,
  ServerIcon,
  CpuChipIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

const HomePage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();

  const features = [
    {
      icon: CloudIcon,
      title: 'Cloud Infrastructure',
      description: 'Oracle Cloud와 OpenStack 기반 홈랩 환경에서 운영되는 개인 클라우드 인프라',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      icon: ServerIcon,
      title: 'Microservices Architecture',
      description: 'API Gateway, Auth Server, Frontend 등 마이크로서비스 아키텍처로 구성',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      icon: CpuChipIcon,
      title: 'Modern Tech Stack',
      description: 'FastAPI, React, Docker, Terraform 등 최신 기술 스택 활용',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      icon: ShieldCheckIcon,
      title: 'Security & Monitoring',
      description: 'JWT 인증, Rate Limiting, Prometheus 모니터링 등 보안과 관찰성 확보',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              <span className="gradient-text">BNGdrasil</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto">
              개인 개발자 <strong>bnbong</strong>의 클라우드 생태계
            </p>
            <p className="text-lg text-gray-500 mb-12 max-w-2xl mx-auto">
              포트폴리오부터 게임 플랫폼, API 서비스까지 하나로 통합된 개인 인프라 프로젝트
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to={ROUTES.PORTFOLIO}
                className="btn-primary inline-flex items-center"
              >
                포트폴리오 보기
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Link>
              <a
                href={`https://${APP_CONFIG.DOMAINS.PLAYGROUND}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline inline-flex items-center"
              >
                게임 플랫폼 체험
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </a>
            </div>

            {isAuthenticated && (
              <div className="mt-8 p-6 bg-blue-50 rounded-lg inline-block">
                <p className="text-blue-800 mb-3">
                  안녕하세요, <strong>{user?.username}</strong>님! 
                </p>
                {user?.is_superuser && (
                  <div className="flex flex-wrap gap-2">
                    <Link to={ROUTES.ADMIN} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors">
                      서비스 관리
                    </Link>
                    <Link to={ROUTES.VM_MANAGEMENT} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors">
                      VM 관리
                    </Link>
                    <Link to={ROUTES.MONITORING} className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 transition-colors">
                      모니터링
                    </Link>
                    <Link to={ROUTES.USER_MANAGEMENT} className="bg-orange-600 text-white px-3 py-1 rounded text-sm hover:bg-orange-700 transition-colors">
                      사용자 관리
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              주요 특징
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              BNGdrasil은 개인 클라우드 인프라의 모든 측면을 다루는 종합적인 프로젝트입니다
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="text-center group hover:scale-105 transition-transform duration-200"
                >
                  <div className={`inline-flex items-center justify-center w-16 h-16 ${feature.bgColor} rounded-lg mb-4 group-hover:shadow-lg transition-shadow`}>
                    <Icon className={`h-8 w-8 ${feature.color}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              BNGdrasil 생태계
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              각각 독립적으로 동작하면서도 유기적으로 연결된 프로젝트들
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Object.entries(BNGDRASIL_PROJECTS).map(([key, project]) => (
              <div
                key={key}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-shadow duration-200"
              >
                <div className="flex items-center mb-4">
                  <span className="text-2xl mr-3">{project.emoji}</span>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {project.name}
                  </h3>
                </div>
                <p className="text-gray-600 mb-4">
                  {project.description}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {project.tech.map((tech) => (
                    <span
                      key={tech}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
                <a
                  href={project.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium inline-flex items-center"
                >
                  GitHub에서 보기
                  <ArrowRightIcon className="ml-1 h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="py-24 bg-blue-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              BNGdrasil과 함께하세요
            </h2>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              회원가입하시면 관리자 기능과 추가 서비스를 이용하실 수 있습니다
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to={ROUTES.REGISTER}
                className="bg-white text-blue-600 hover:bg-gray-50 px-8 py-3 rounded-md font-medium transition-colors"
              >
                회원가입
              </Link>
              <Link
                to={ROUTES.LOGIN}
                className="border border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3 rounded-md font-medium transition-colors"
              >
                로그인
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default HomePage;
